const fs = require('fs');
let code = fs.readFileSync('src/guard.ts', 'utf8');

// 1. Replace the set declaration with functions
code = code.replace(
    'const cancelledOrders = new Set<number>();',
    `function isCancelled(orderId: number): boolean {\n    const row = db.prepare('SELECT id FROM CancelledOrders WHERE id = ?').get(orderId);\n    return !!row;\n}\n\nfunction recordCancelled(orderId: number) {\n    db.prepare('INSERT OR IGNORE INTO CancelledOrders (id) VALUES (?)').run(orderId);\n}`
);

// 2. Replace .has() with isCancelled()
code = code.replace(/cancelledOrders\.has\(/g, 'isCancelled(');

// 3. Replace .add() with recordCancelled()
code = code.replace(/cancelledOrders\.add\(/g, 'recordCancelled(');

fs.writeFileSync('src/guard.ts', code);
