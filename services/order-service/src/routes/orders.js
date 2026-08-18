const express = require("express");
const orderController = require("../controllers/orderController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// All order endpoints require authentication
router.use(authenticate);

router.get(
  "/",
  orderController.getOrders
);

router.get(
  "/customer/:userId",
  orderController.getOrdersByCustomer
);

router.get(
  "/:orderId",
  orderController.getOrderById
);

router.post(
  "/",
  orderController.createOrder
);

router.patch(
  "/:orderId/status",
  orderController.updateOrderStatus
);

module.exports = router;