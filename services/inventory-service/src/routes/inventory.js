const express = require("express");

const {
  getInventory,
  updateInventory,
  reserveInventory,
  releaseInventory
} = require("../controllers/inventoryController");

const router = express.Router();

router.get(
  "/:productId",
  getInventory
);

router.patch(
  "/:productId",
  updateInventory
);

router.post(
  "/:productId/reserve",
  reserveInventory
);

router.post(
  "/:productId/release",
  releaseInventory
);

module.exports = router;