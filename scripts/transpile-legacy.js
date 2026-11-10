const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '..', '.build-tmp');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

console.log(' 🔄 Transpiling to GNOME 42.9 format in dist/...');

function resolveLocalModuleAccess(fromFileRel, importPath) {
    const fromDir = path.dirname(fromFileRel);
    const resolved = path.normalize(path.join(fromDir, importPath));
    const withoutExt = resolved.replace(/\.js$/, '');
    const segments = withoutExt.split(path.sep).filter(Boolean);
    const bracketAccess = segments.map(s => `['${s}']`).join('');
    return `imports.misc.extensionUtils.getCurrentExtension().imports${bracketAccess}`;
}

function transpileModule(relFile, code) {
    if (relFile === 'extension.js') {
        return transpileExtensionFile(code);
    }
    if (relFile === 'prefs.js') {
        return transpilePrefsFile(code);
    }

    let output = code;

    // Remove reference comments
    output = output.replace(/^\s*\/\/\/ <reference path=.*\/>[\r\n]*/gm, '');

    // Transpile GI imports
    output = output.replace(/^\s*import\s+(\w+)\s+from\s+['"]gi:\/\/(\w+)(?:\?version=.*)?['"];?/gm, 'var $1 = imports.gi.$2;');
    output = output.replace(/^\s*import\s*\{\s*([^}]+)\s*\}\s*from\s+['"]gi:\/\/(\w+)(?:\?version=.*)?['"];?/gm, 'var { $1 } = imports.gi.$2;');

    // Transpile Shell UI / resource imports
    output = output.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]resource:\/\/\/org\/gnome\/shell\/ui\/(\w+)\.js['"];?/gm, 'var $1 = imports.ui.$2;');
    output = output.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]resource:\/\/\/org\/gnome\/Shell\/Extensions\/js\/(\w+)\.js['"];?/gm, 'var $1 = imports.misc.$2;');
    output = output.replace(/^\s*import\s+\{\s*(?:Extension|ExtensionPreferences)\s*\}\s+from\s+['"].*['"];?/gm, '');

    // Transpile local re-exports: export * from './foo.js';
    output = output.replace(/^\s*export\s+\*\s+from\s+['"](\.[^'"]+)['"];?/gm, (match, importPath) => {
        const accessor = resolveLocalModuleAccess(relFile, importPath);
        return `var _reexp = ${accessor};\nfor (var _k in _reexp) { this[_k] = _reexp[_k]; }`;
    });

    // Transpile named re-exports: export { Foo, Bar } from './foo.js';
    output = output.replace(/^\s*export\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"];?/gm, (match, names, importPath) => {
        const formatted = names.split(',').map(s => s.trim().replace(/\s+as\s+/g, ': ')).join(', ');
        return `var { ${formatted} } = ${resolveLocalModuleAccess(relFile, importPath)};`;
    });

    // Transpile local wildcard imports: import * as Foo from './foo.js';
    output = output.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"](\.[^'"]+)['"];?/gm, (match, varName, importPath) => {
        return `var ${varName} = ${resolveLocalModuleAccess(relFile, importPath)};`;
    });

    // Transpile local named imports: import { Foo, Bar } from './foo.js';
    output = output.replace(/^\s*import\s*\{\s*([^}]+)\s*\}\s*from\s+['"](\.[^'"]+)['"];?/gm, (match, namedList, importPath) => {
        const formatted = namedList.split(',').map(s => s.trim().replace(/\s+as\s+/g, ': ')).join(', ');
        return `var { ${formatted} } = ${resolveLocalModuleAccess(relFile, importPath)};`;
    });

    // Transpile local default imports: import Foo from './foo.js';
    output = output.replace(/^\s*import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"];?/gm, (match, varName, importPath) => {
        return `var ${varName} = ${resolveLocalModuleAccess(relFile, importPath)};`;
    });

    // Remove standalone export { Foo, Bar };
    output = output.replace(/^\s*export\s*\{[^}]*\}\s*;?/gm, '');

    // Convert export declarations to top-level var/function
    output = output.replace(/export\s+const\s+/g, 'var ');
    output = output.replace(/export\s+let\s+/g, 'var ');
    output = output.replace(/export\s+function\s+/g, 'function ');
    output = output.replace(/export\s+class\s+(\w+)/g, 'var $1 = class $1');

    return output;
}

function transpileExtensionFile(code) {
    return `var ExtensionUtils = imports.misc.extensionUtils;
var Me = ExtensionUtils.getCurrentExtension();
var ExtensionManager = Me.imports['core']['extension-manager'].ExtensionManager;

let manager = null;

function init(metadata) {
    log('[SalatExtension Legacy] Initializing extension...');
}

function enable() {
    log('[SalatExtension Legacy] Enabling extension...');
    try {
        manager = new ExtensionManager(Me.dir, Me.path);
        manager.enable();
        log('[SalatExtension Legacy] Extension enabled successfully!');
    } catch (e) {
        log('[SalatExtension Legacy] FATAL ERROR in enable(): ' + e.message + '\\n' + e.stack);
    }
}

function disable() {
    log('[SalatExtension Legacy] Disabling extension...');
    try {
        if (manager) {
            manager.disable();
            manager = null;
        }
        log('[SalatExtension Legacy] Extension disabled cleanly.');
    } catch (e) {
        log('[SalatExtension Legacy] Error during disable(): ' + e.message);
    }
}
`;
}

function transpilePrefsFile(code) {
    let output = code;

    // 1. Remove reference comments and imports
    output = output.replace(/^\s*\/\/\/ <reference path=.*\/>[\r\n]*/gm, '');
    output = output.replace(/^\s*import\s+.*[\r\n]*/gm, '');

    // 2. Prefix with legacy imports and modules helper
    const prefix = `var { Adw, Gtk, GLib } = imports.gi;
var ExtensionUtils = imports.misc.extensionUtils;

function _getPrefsModules() {
    const Me = ExtensionUtils.getCurrentExtension();
    return {
        Constants: Me.imports['core']['constants'],
        Config: Me.imports['services']['config-service'],
        I18n: Me.imports['utils']['i18n'],
        Api: Me.imports['services']['prayer-service'],
        AudioService: Me.imports['services']['audio-service'],
        SystemService: Me.imports['services']['system-service'],
        FileUtils: Me.imports['utils']['file-utils']
    };
}

function playAudioPreview(path) {
    if (!path) return;
    const { AudioService } = _getPrefsModules();
    AudioService.playAudio(path);
}

function resolveDefaultAdhanPath() {
    const { FileUtils } = _getPrefsModules();
    return FileUtils.findExtensionFile('adan.mp3') || '';
}

function openScheduleDedicatedWindow() {
    const { SystemService } = _getPrefsModules();
    SystemService.openScheduleWindow();
}

function init(metadata) {}

`;

    // 3. Transform the class declaration into function fillPreferencesWindow(window)
    output = output.replace(
        /export\s+default\s+class\s+SalatPreferences\s+extends\s+ExtensionPreferences\s*\{\s*fillPreferencesWindow\s*\(\s*window\s*\)\s*\{/,
        'function fillPreferencesWindow(window) {\n    const { Constants, Config, I18n, Api, AudioService, SystemService, FileUtils } = _getPrefsModules();'
    );

    // 4. Strip the trailing closing brace of the class
    output = output.trim();
    if (output.endsWith('}')) {
        output = output.slice(0, -1);
    }

    // 5. Add buildPrefsWidget fallback
    const suffix = '\n\nfunction buildPrefsWidget() {\n    let dummyWin = new Adw.PreferencesWindow();\n    fillPreferencesWindow(dummyWin);\n    return dummyWin.get_visible_page() || new Adw.PreferencesPage();\n}\n';

    return prefix + output + suffix;
}

// Recursively process files from tmpDir to distDir
function processDirectory(currentDir, baseDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(baseDir, fullPath);
        const destPath = path.join(distDir, relPath);

        if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            processDirectory(fullPath, baseDir);
        } else if (entry.isFile()) {
            const destDirName = path.dirname(destPath);
            if (!fs.existsSync(destDirName)) {
                fs.mkdirSync(destDirName, { recursive: true });
            }

            if (entry.name.endsWith('.js')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const transpiled = transpileModule(relPath, content);
                fs.writeFileSync(destPath, transpiled, 'utf8');
                console.log(`  ✔ Transpiled ${relPath} -> dist/${relPath}`);
            } else if (entry.name === 'metadata.json') {
                const meta = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                meta['shell-version'] = ["42", "42.9"];
                fs.writeFileSync(destPath, JSON.stringify(meta, null, 2), 'utf8');
                console.log(`  ✔ Generated metadata.json for GNOME 42.9 -> dist/metadata.json`);
            } else {
                fs.copyFileSync(fullPath, destPath);
                console.log(`  ✔ Copied ${relPath} -> dist/${relPath}`);
            }
        }
    }
}

if (fs.existsSync(tmpDir)) {
    processDirectory(tmpDir, tmpDir);

    function safeRmSync(p) {
        if (!fs.existsSync(p)) return;
        if (typeof fs.rmSync === 'function') {
            fs.rmSync(p, { recursive: true, force: true });
        } else {
            fs.rmdirSync(p, { recursive: true });
        }
    }

    safeRmSync(tmpDir);
}

console.log('✔ Transpilation complete! GNOME 42.9 extension ready in dist/');
