const express = require("express");

const {
  getPayments,
  getPaymentById,
  getPaymentsByOrder,
  createPayment,
  refundPayment
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/", getPayments);

router.get(
  "/order/:orderId",
  getPaymentsByOrder
);

router.get(
  "/:paymentId",
  getPaymentById
);

router.post(
  "/",
  createPayment
);

router.post(
  "/:paymentId/refund",
  refundPayment
);

module.exports = router;