// scripts/patch-subsystem.js
// Flip a Windows PE executable from the "console" subsystem (3) to the
// "GUI" subsystem (2). pkg always builds console exes, which forces a
// terminal window to appear on launch. Patching this single field makes
// Windows launch the exe with no console window at all.
//
// Usage: node scripts/patch-subsystem.js <path-to-exe>

const fs = require('fs');

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3; // console

function patch(exePath) {
    const buf = fs.readFileSync(exePath);

    // DOS header: e_lfanew (pointer to PE header) at offset 0x3C
    if (buf.readUInt16LE(0) !== 0x5A4D) throw new Error('Not an MZ/PE file'); // "MZ"
    const peOff = buf.readUInt32LE(0x3C);

    // PE signature "PE\0\0"
    if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('PE signature not found');

    // Optional header starts after PE signature (4) + COFF header (20)
    const optOff = peOff + 4 + 20;
    const magic = buf.readUInt16LE(optOff);
    if (magic !== 0x10b && magic !== 0x20b) throw new Error(`Unexpected optional header magic 0x${magic.toString(16)}`);

    // Subsystem field is at offset 68 within the optional header for both
    // PE32 (0x10b) and PE32+ (0x20b)
    const subOff = optOff + 68;
    const current = buf.readUInt16LE(subOff);

    if (current === IMAGE_SUBSYSTEM_WINDOWS_GUI) {
        console.log('✓ Already GUI subsystem — no console window. No change needed.');
        return;
    }
    if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
        console.log(`⚠ Subsystem is ${current} (not console); leaving unchanged.`);
        return;
    }

    buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subOff);
    fs.writeFileSync(exePath, buf);
    console.log('✓ Patched subsystem console(3) → GUI(2): no terminal window will appear.');
}

const target = process.argv[2];
if (!target) {
    console.error('Usage: node scripts/patch-subsystem.js <path-to-exe>');
    process.exit(1);
}
try {
    patch(target);
} catch (err) {
    console.error('✗ Failed to patch subsystem:', err.message);
    process.exit(1);
}
