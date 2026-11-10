/// <reference path="./types.d.ts" />
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionManager } from './core/extension-manager.js';

let manager: ExtensionManager | null = null;

export default class SalatExtension extends Extension {
    enable() {
        manager = new ExtensionManager(this.dir, this.path);
        manager.enable();
    }

    disable() {
        if (manager) {
            manager.disable();
            manager = null;
        }
    }
}

export function init(metadata: any) {
    log('[SalatExtension] Initialized.');
}

export function enable() {
    manager = new ExtensionManager();
    manager.enable();
}

export function disable() {
    if (manager) {
        manager.disable();
        manager = null;
    }
}
