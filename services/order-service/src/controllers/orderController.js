const orderRepository = require("../repositories/orderRepository");
const { getUser, getProduct } = require("../clients/serviceClient");
const { publishEvent } = require("../config/eventbridge");

const VALID_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED",
];

async function getOrders(req, res, next) {
  try {
    const orders = await orderRepository.findAll();
    return res.status(200).json({ data: orders });
  } catch (error) {
    next(error);
  }
}

async function getOrderById(req, res, next) {
  try {
    const order = await orderRepository.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    return res.status(200).json({ data: order });
  } catch (error) {
    next(error);
  }
}

async function getOrdersByCustomer(req, res, next) {
  try {
    const requestedCustomerId = req.params.userId;
    if (req.user.role === "CUSTOMER" && req.user.id !== requestedCustomerId) {
      return res.status(403).json({ error: "You can only view your own orders" });
    }
    const orders = await orderRepository.findByCustomerId(requestedCustomerId);
    return res.status(200).json({ data: orders });
  } catch (error) {
    next(error);
  }
}

async function createOrder(req, res) {
  try {
    const {
      customerId,
      items,
      shippingAddress,
      currency = "GBP",
      warehouseId,
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one order item is required" });
    }
    if (!shippingAddress) {
      return res.status(400).json({ error: "shippingAddress is required" });
    }

    if (req.user.role === "CUSTOMER" && req.user.id !== customerId) {
      return res.status(403).json({ error: "You can only create orders for yourself" });
    }

    const customer = await getUser(customerId, req.headers.authorization);
    if (!customer) {
      return res.status(400).json({ error: "Customer does not exist" });
    }

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
        productName: product.name, // ✅ NEW — captured for notifications
        quantity: item.quantity,
        unitPrice,
        subtotal,
      });
    }

    const totalAmount = Number(
      orderItems.reduce((total, item) => total + item.subtotal, 0).toFixed(2)
    );

    const order = {
      orderId: `ORD${Date.now()}`,
      customerId,
      status: "PENDING",
      totalAmount,
      currency,
      shippingAddress,
      items: orderItems,
    };

    const createdOrder = await orderRepository.create(order);

    const eventPayload = {
      orderId: createdOrder.orderId,
      customerId: createdOrder.customerId,
      totalAmount: createdOrder.totalAmount,
      currency: createdOrder.currency,
      items: createdOrder.items, // ✅ already contains productName
    };

    if (warehouseId) {
      eventPayload.warehouseId = warehouseId;
    }

    await publishEvent("OrderCreated", eventPayload);

    return res.status(201).json({ data: createdOrder });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
}

async function updateOrderStatus(req, res, next) {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}`,
    });
  }
  try {
    const order = await orderRepository.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (req.user.role === "CUSTOMER") {
      return res.status(403).json({ error: "Customers cannot update order status" });
    }
    const updatedOrder = await orderRepository.updateStatus(req.params.orderId, status);
    return res.status(200).json({ data: updatedOrder });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrders,
  getOrderById,
  getOrdersByCustomer,
  createOrder,
  updateOrderStatus,
};