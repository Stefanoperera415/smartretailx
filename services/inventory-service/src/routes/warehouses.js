const express = require("express");
const warehouseController = require("../controllers/warehouseController");

const router = express.Router();

router.get("/", warehouseController.getWarehouses);
router.get("/:warehouseId", warehouseController.getWarehouseById);
router.post("/", warehouseController.createWarehouse);
router.put("/:warehouseId", warehouseController.updateWarehouse);
router.delete("/:warehouseId", warehouseController.deleteWarehouse);

module.exports = router;