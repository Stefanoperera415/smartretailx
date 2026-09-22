const express = require("express");
const {
  getPayments,
  getPaymentById,
  getPaymentsByOrder,
  refundPayment,
  createPaymentIntent,
  confirmPayment,
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/", getPayments);
router.get("/order/:orderId", getPaymentsByOrder);
router.get("/:paymentId", getPaymentById);

router.post("/create-payment-intent", createPaymentIntent);
router.post("/confirm-payment", confirmPayment);

router.post("/:paymentId/refund", refundPayment);

module.exports = router;