process.env.MONGO_URL ||= "mongodb://localhost/x";
process.env.JWT_ACCESS_SECRET ||= "x";
process.env.JWT_REFRESH_SECRET ||= "x";
process.env.COOKIE_SECRET ||= "x";
process.env.TZ = "UTC";

// Import the heaviest graphs to catch import cycles / errors
const svc = await import("./src/modules/attendance/services/attendance.service.js");
const notif = await import("./src/modules/notifications/services/notifications.service.js");
await import("./src/modules/invoices/services/invoices.service.js");
await import("./src/modules/attendanceExemptions/services/attendanceExemptions.service.js");
await import("./src/jobs/index.js");
await import("./src/middleware/attendanceScope.js");
const cc = await import("./src/helpers/correlationCache.js");

// computeRate: late removed → present/(present+absent), excused/exempt excluded
console.assert(svc.computeRate({present:8,absent:2,excused:0,late:0,exempt:0})===80,"r1");
console.assert(svc.computeRate({present:8,absent:2,excused:5,late:0,exempt:3})===80,"r2 excused/exempt neutral");
console.assert(svc.computeRate({present:9,absent:0,excused:0,late:7,exempt:0})===100,"r3 late ignored, 9/9=100");
console.assert(svc.computeRate({present:0,absent:0,excused:0,late:0,exempt:0})===null,"r4 null");

// correlation cache helper
cc.correlationCacheSet("2026-6",[{a:1}]);
console.assert(cc.correlationCacheGet("2026-6")?.length===1,"cache set/get");
cc.correlationCacheInvalidate(2026,6);
console.assert(cc.correlationCacheGet("2026-6")===null,"cache invalidate");

console.assert(typeof notif.deliverNotification==="function","deliverNotification exported");
console.assert(typeof svc.correlationCacheInvalidate==="function","re-export works");
console.log("SERVER VERIFY OK");
