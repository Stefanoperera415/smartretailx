const express = require("express");
const {
  getInventory,
  getInventoryByWarehouse,
  getAllInventory,
  updateInventory,
  reserveInventory,
  releaseInventory,
  deleteInventory,
} = require("../controllers/inventoryController");

const router = express.Router();

router.get("/", getAllInventory);                          // GET /api/v1/inventory
router.get("/:productId", getInventory);                  // existing
router.get("/:productId/:warehouseId", getInventoryByWarehouse); // new
router.patch("/:productId", updateInventory);             // existing
router.post("/:productId/reserve", reserveInventory);     // existing
router.post("/:productId/release", releaseInventory);     // existing
router.delete("/:productId/:warehouseId", deleteInventory); // new

module.exports = router;