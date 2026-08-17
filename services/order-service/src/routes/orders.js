const express = require("express");
const orderController = require("../controllers/orderController");

const router = express.Router();

router.get("/", orderController.getOrders);

router.get(
  "/customer/:userId",
  orderController.getOrdersByCustomer
);

router.get("/:orderId", orderController.getOrderById);

router.post("/", orderController.createOrder);

router.patch(
  "/:orderId/status",
  orderController.updateOrderStatus
);

module.exports = router;