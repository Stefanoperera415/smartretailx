const { EventEmitter } = require("events");

class NotificationBus extends EventEmitter {}

const bus = new NotificationBus();
bus.setMaxListeners(1000); // many SSE subscribers allowed

module.exports = bus;