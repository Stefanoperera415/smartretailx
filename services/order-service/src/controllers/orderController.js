const orderRepository = require("../repositories/orderRepository");
const { getUser, getProduct } = require("../clients/serviceClient");
const { publishEvent } = require("../events/eventPublisher");

const VALID_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED"
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
    const orders = await orderRepository.findByCustomerId(req.params.userId);
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
      currency = "GBP"
    } = req.body;

    if (!customerId) {
      return res.status(400).json({
        error: "customerId is required"
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "At least one order item is required"
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        error: "shippingAddress is required"
      });
    }

    // 1. Verify customer exists
    const customer = await getUser(customerId);
    if (!customer) {
      return res.status(400).json({
        error: "Customer does not exist"
      });
    }

    // 2. Validate products and obtain authoritative prices
    const orderItems = [];
    for (const item of items) {
      if (
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return res.status(400).json({
          error: "Each item requires a valid productId and positive integer quantity"
        });
      }

      const product = await getProduct(item.productId);
      if (!product) {
        return res.status(400).json({
          error: `Product ${item.productId} does not exist`
        });
      }

      const unitPrice = Number(product.price);
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));
      orderItems.push({
        productId: product.productId,
        quantity: item.quantity,
        unitPrice,
        subtotal
      });
    }

    // 3. Calculate total using Product Service prices
    const totalAmount = Number(
      orderItems.reduce((total, item) => total + item.subtotal, 0).toFixed(2)
    );

    // 4. Create order
    const order = {
      orderId: `ORD${Date.now()}`,
      customerId,
      status: "PENDING",
      totalAmount,
      currency,
      shippingAddress,
      items: orderItems,
      createdAt: new Date().toISOString()
    };

    const createdOrder = await orderRepository.create(order);

    // Publish event after successful creation
    publishEvent(
      "OrderCreated",
      {
        orderId: createdOrder.orderId,
        customerId: createdOrder.customerId,
        totalAmount: createdOrder.totalAmount,
        currency: createdOrder.currency,
        items: createdOrder.items
      }
    );

    return res.status(201).json({
      data: createdOrder
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({
      error: "Failed to create order"
    });
  }
}

async function updateOrderStatus(req, res, next) {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Allowed values: ${VALID_STATUSES.join(", ")}`
    });
  }

  try {
    const order = await orderRepository.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
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
  updateOrderStatus
};