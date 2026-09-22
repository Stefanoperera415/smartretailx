const paymentRepository = require("../repositories/paymentRepository");
const { publishEvent } = require("../config/eventbridge");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

async function getPayments(req, res) {
  try {
    const payments = await paymentRepository.findAll();
    return res.status(200).json({ data: payments });
  } catch (error) {
    console.error("Get payments error:", error);
    return res.status(500).json({ error: "Failed to retrieve payments" });
  }
}

async function getPaymentById(req, res) {
  try {
    const payment = await paymentRepository.findById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    return res.status(200).json({ data: payment });
  } catch (error) {
    console.error("Get payment error:", error);
    return res.status(500).json({ error: "Failed to retrieve payment" });
  }
}

async function getPaymentsByOrder(req, res) {
  try {
    const payments = await paymentRepository.findByOrderId(req.params.orderId);
    return res.status(200).json({ data: payments });
  } catch (error) {
    console.error("Get order payments error:", error);
    return res.status(500).json({ error: "Failed to retrieve payments" });
  }
}

async function createPaymentIntent(req, res) {
  try {
    const { orderId, customerId, amount, currency = "GBP" } = req.body;
    if (!orderId || !customerId || !amount) {
      return res
        .status(400)
        .json({ error: "orderId, customerId and amount are required" });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: { orderId, customerId },
    });
    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Create PaymentIntent error:", error);
    return res.status(500).json({ error: "Failed to create payment intent" });
  }
}

async function confirmPayment(req, res) {
  try {
    const {
      paymentIntentId,
      orderId,
      customerId,
      amount,
      currency,
      items = [],           // ✅ now expected to carry productName
      warehouseId,
    } = req.body;

    if (!paymentIntentId || !orderId || !customerId || !amount) {
      return res.status(400).json({
        error: "paymentIntentId, orderId, customerId and amount are required",
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    const payment = {
      paymentId: `PAY${Date.now()}`,
      orderId,
      customerId,
      amount,
      currency: currency || "GBP",
      status: "COMPLETED",
      provider: "STRIPE",
      transactionRef: paymentIntentId,
    };
    await paymentRepository.create(payment);

    // ✅ Forward items (with productName) so notification-service can build
    //    "Your 'iPhone 15' will be delivered shortly."
    await publishEvent("PaymentCompleted", {
      orderId,
      customerId,
      amount,
      currency: currency || "GBP",
      items: Array.isArray(items) ? items : [],
      warehouseId: warehouseId || "WH01",
      transactionRef: paymentIntentId,
    });

    return res
      .status(200)
      .json({ message: "Payment confirmed successfully", payment });
  } catch (error) {
    console.error("Confirm payment error:", error);
    return res.status(500).json({ error: "Failed to confirm payment" });
  }
}

async function refundPayment(req, res) {
  try {
    const payment = await paymentRepository.findById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    if (payment.status !== "COMPLETED") {
      return res.status(409).json({ error: "Only completed payments can be refunded" });
    }
    const refundedPayment = await paymentRepository.updateStatus(
      payment.payment_id,
      "REFUNDED"
    );
    return res
      .status(200)
      .json({ message: "Payment refunded successfully", data: refundedPayment });
  } catch (error) {
    console.error("Refund payment error:", error);
    return res.status(500).json({ error: "Failed to refund payment" });
  }
}

module.exports = {
  getPayments,
  getPaymentById,
  getPaymentsByOrder,
  createPaymentIntent,
  confirmPayment,
  refundPayment,
};