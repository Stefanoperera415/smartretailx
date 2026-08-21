const inventoryRepo = require("../repositories/inventoryRepository");

async function reserveStock(productId, warehouseId, quantity) {
  const numericQuantity = Number(quantity);
  if (!productId || !warehouseId || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
    throw new Error(`Invalid inventory reservation`);
  }
  return inventoryRepo.reserveStock(productId, warehouseId, numericQuantity);
}

async function releaseStock(productId, warehouseId, quantity) {
  const numericQuantity = Number(quantity);
  if (!productId || !warehouseId || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
    throw new Error(`Invalid inventory release`);
  }
  return inventoryRepo.releaseStock(productId, warehouseId, numericQuantity);
}

module.exports = { reserveStock, releaseStock };