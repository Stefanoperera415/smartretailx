const inventoryRepo = require("../repositories/inventoryRepository");

async function reserveStock(productId, warehouseId, quantity) {
  const numericQuantity = Number(quantity);
  if (!productId || !warehouseId || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
    throw new Error(`Invalid inventory reservation`);
  }
  return inventoryRepo.reserveStock(productId, warehouseId, numericQuantity);
}

/**
 * Release stock. Idempotent — if there's nothing to release, return a
 * synthetic success object rather than throwing.
 */
async function releaseStock(productId, warehouseId, quantity) {
  const numericQuantity = Number(quantity);
  if (!productId || !warehouseId || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
    throw new Error(`Invalid inventory release`);
  }

  try {
    const result = await inventoryRepo.releaseStock(productId, warehouseId, numericQuantity);
    return result;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // Reserved quantity < requested — nothing to release. Return a no-op marker.
      console.warn(`releaseStock no-op: ${productId}/${warehouseId} (${numericQuantity})`);
      return { _noop: true };
    }
    throw err;
  }
}

module.exports = { reserveStock, releaseStock };