const orderRepository = require("../repositories/orderRepository");
const { getUser, getProduct } = require("../clients/serviceClient");
const outboxRepo = require("../repositories/outboxRepository");

const VALID_STATUSES = [
  "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED",
  "DELIVERED", "CANCELLED", "PAYMENT_FAILED",
];

function generateOrderId() {
  // Date.now() alone can collide under high concurrency. Add entropy.
  const suffix = Math.random().toString(36).substring(2, 6);
  return `ORD${Date.now()}-${suffix}`;
}

async function getOrders(req, res, next) {
  try {
    const orders = await orderRepository.findAll();
    return res.status(200).json({ data: orders });
  } catch (error) { next(error); }
}

async function getOrderById(req, res, next) {
  try {
    const order = await orderRepository.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    return res.status(200).json({ data: order });
  } catch (error) { next(error); }
}

async function getOrdersByCustomer(req, res, next) {
  try {
    const requestedCustomerId = req.params.userId;
    if (req.user.role === "CUSTOMER" && req.user.id !== requestedCustomerId) {
      return res.status(403).json({ error: "You can only view your own orders" });
    }
    const orders = await orderRepository.findByCustomerId(requestedCustomerId);
    return res.status(200).json({ data: orders });
  } catch (error) { next(error); }
}

async function createOrder(req, res) {
  try {
    const {
      customerId, items, shippingAddress,
      currency = "GBP", warehouseId,
    } = req.body;

    if (!customerId) return res.status(400).json({ error: "customerId is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one order item is required" });
    }
    if (!shippingAddress) return res.status(400).json({ error: "shippingAddress is required" });

    if (req.user.role === "CUSTOMER" && req.user.id !== customerId) {
      return res.status(403).json({ error: "You can only create orders for yourself" });
    }

    const customer = await getUser(customerId, req.headers.authorization);
    if (!customer) return res.status(400).json({ error: "Customer does not exist" });

    const orderItems = [];
    for (const item of items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({
          error: "Each item requires a valid productId and positive integer quantity",
        });
      }
      const product = await getProduct(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} does not exist` });
      }
      const unitPrice = Number(product.price);
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));
      orderItems.push({
        productId: product.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      });
    }

    const totalAmount = Number(
      orderItems.reduce((total, item) => total + item.subtotal, 0).toFixed(2)
    );

    const order = {
      orderId: generateOrderId(),
      customerId,
      status: "PENDING",
      totalAmount,
      currency,
      shippingAddress,
      items: orderItems,
    };

    // ✅ Outbox: write the event inside the same transaction as the order insert.
    const eventId = `order-created-${order.orderId}`;
    const eventPayload = {
      orderId: order.orderId,
      customerId: order.customerId,
      totalAmount: order.totalAmount,
      currency: order.currency,
      items: order.items,
    };
    if (warehouseId) eventPayload.warehouseId = warehouseId;

    const createdOrder = await orderRepository.create(order, async (client) => {
      await outboxRepo.enqueue(client, eventId, "OrderCreated", eventPayload);
    });

    return res.status(201).json({ data: createdOrder });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
}

async function updateOrderStatus(req, res, next) {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status is required" });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}`,
    });
  }
  try {
    const order = await orderRepository.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (req.user.role === "CUSTOMER") {
      return res.status(403).json({ error: "Customers cannot update order status" });
    }

    const isCancelling =
      status === "CANCELLED" && order.status !== "CANCELLED";

    // ✅ When cancelling a previously non-cancelled order, emit compensation.
    const updatedOrder = await orderRepository.updateStatus(
      req.params.orderId,
      status,
      async (client) => {
        if (isCancelling) {
          // Release inventory that was reserved for this order.
          // Use per-item warehouseId when available; fallback to event's warehouse.
          const releaseEventId = `release-${order.orderId}`;
          const releaseItems = order.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            warehouseId: it.warehouseId || null, // may be null → consumer falls back
          }));
          await outboxRepo.enqueue(client, releaseEventId, "ReleaseInventory", {
            orderId: order.orderId,
            customerId: order.customerId,
            items: releaseItems,
            warehouseId: order.warehouseId || null,
          });

          // Request refund — payment-service decides if it applies.
          const refundEventId = `refund-${order.orderId}`;
          await outboxRepo.enqueue(client, refundEventId, "RefundPayment", {
            orderId: order.orderId,
            customerId: order.customerId,
            amount: order.totalAmount,
            currency: order.currency,
            reason: "Order cancelled",
          });

          // Notify the customer.
          const notifyEventId = `notify-cancel-${order.orderId}`;
          await outboxRepo.enqueue(client, notifyEventId, "OrderCancelled", {
            orderId: order.orderId,
            customerId: order.customerId,
            items: order.items,
          });
        }
      }
    );

    return res.status(200).json({ data: updatedOrder });
  } catch (error) { next(error); }
}

module.exports = {
  getOrders,
  getOrderById,
  getOrdersByCustomer,
  createOrder,
  updateOrderStatus,
};