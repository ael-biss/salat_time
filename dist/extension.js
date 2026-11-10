var ExtensionUtils = imports.misc.extensionUtils;
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
        log('[SalatExtension Legacy] FATAL ERROR in enable(): ' + e.message + '\n' + e.stack);
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
