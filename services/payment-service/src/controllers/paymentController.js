const paymentRepository = require("../repositories/paymentRepository");

const VALID_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "COMPLETED",
  "FAILED",
  "REFUNDED"
];

async function getPayments(req, res) {
  try {
    const payments = await paymentRepository.findAll();

    return res.status(200).json({
      data: payments
    });
  } catch (error) {
    console.error("Get payments error:", error);

    return res.status(500).json({
      error: "Failed to retrieve payments"
    });
  }
}

async function getPaymentById(req, res) {
  try {
    const payment = await paymentRepository.findById(
      req.params.paymentId
    );

    if (!payment) {
      return res.status(404).json({
        error: "Payment not found"
      });
    }

    return res.status(200).json({
      data: payment
    });
  } catch (error) {
    console.error("Get payment error:", error);

    return res.status(500).json({
      error: "Failed to retrieve payment"
    });
  }
}

async function getPaymentsByOrder(req, res) {
  try {
    const payments = await paymentRepository.findByOrderId(
      req.params.orderId
    );

    return res.status(200).json({
      data: payments
    });
  } catch (error) {
    console.error("Get order payments error:", error);

    return res.status(500).json({
      error: "Failed to retrieve payments"
    });
  }
}

async function createPayment(req, res) {
  try {
    const {
      orderId,
      customerId,
      amount,
      currency = "GBP"
    } = req.body;

    if (!orderId || !customerId || amount === undefined) {
      return res.status(400).json({
        error: "orderId, customerId and amount are required"
      });
    }

    if (
      typeof amount !== "number" ||
      amount <= 0
    ) {
      return res.status(400).json({
        error: "amount must be a number greater than zero"
      });
    }

    const paymentId = `PAY${Date.now()}`;

    // Local mock payment gateway behaviour.
    const paymentSucceeded = amount < 10000;

    const status = paymentSucceeded
      ? "COMPLETED"
      : "FAILED";

    const transactionRef = paymentSucceeded
      ? `MOCK-TXN-${Date.now()}`
      : null;

    const payment = {
      paymentId,
      orderId,
      customerId,
      amount,
      currency,
      status,
      provider: "MOCK_GATEWAY",
      transactionRef
    };

    const createdPayment =
      await paymentRepository.create(payment);

    return res.status(201).json({
      data: createdPayment
    });
  } catch (error) {
    console.error("Create payment error:", error);

    return res.status(500).json({
      error: "Failed to create payment"
    });
  }
}

async function refundPayment(req, res) {
  try {
    const payment =
      await paymentRepository.findById(
        req.params.paymentId
      );

    if (!payment) {
      return res.status(404).json({
        error: "Payment not found"
      });
    }

    if (payment.status !== "COMPLETED") {
      return res.status(409).json({
        error:
          "Only completed payments can be refunded"
      });
    }

    const refundedPayment =
      await paymentRepository.updateStatus(
        payment.payment_id,
        "REFUNDED"
      );

    return res.status(200).json({
      message: "Payment refunded successfully",
      data: refundedPayment
    });
  } catch (error) {
    console.error("Refund payment error:", error);

    return res.status(500).json({
      error: "Failed to refund payment"
    });
  }
}

module.exports = {
  getPayments,
  getPaymentById,
  getPaymentsByOrder,
  createPayment,
  refundPayment
};