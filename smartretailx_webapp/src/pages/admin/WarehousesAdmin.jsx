import { useEffect, useState } from "react";
import * as inventoryService from "../../services/inventoryService";
import LoadingSpinner from "../../components/LoadingSpinner";

const WarehousesAdmin = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({ name: "", location: "", status: "ACTIVE" });
  const [error, setError] = useState("");

  const fetchWarehouses = async () => {
    try {
      const res = await inventoryService.getWarehouses();
      setWarehouses(res.data.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const resetForm = () => {
    setFormData({ name: "", location: "", status: "ACTIVE" });
    setEditingWarehouse(null);
    setError("");
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (warehouse) => {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name,
      location: warehouse.location || "",
      status: warehouse.status || "ACTIVE",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editingWarehouse) {
        await inventoryService.updateWarehouse(editingWarehouse.warehouseId, formData);
      } else {
        await inventoryService.createWarehouse(formData);
      }
      setShowModal(false);
      fetchWarehouses();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save warehouse");
    }
  };

  const handleDelete = async (warehouseId) => {
    if (!window.confirm("Are you sure you want to delete this warehouse?")) return;
    try {
      await inventoryService.deleteWarehouse(warehouseId);
      fetchWarehouses();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete warehouse");
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error && !showModal) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Warehouses</h1>
        <button onClick={openCreateModal} className="btn-primary">
          Add Warehouse
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No warehouses yet.</td>
                </tr>
              ) : (
                warehouses.map((wh) => (
                  <tr key={wh.warehouseId}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">{wh.warehouseId}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{wh.name}</td>
                    <td className="px-6 py-4">{wh.location || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                        wh.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {wh.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => openEditModal(wh)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(wh.warehouseId)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">
              {editingWarehouse ? "Edit Warehouse" : "New Warehouse"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input-field"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">{error}</div>}
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingWarehouse ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehousesAdmin;