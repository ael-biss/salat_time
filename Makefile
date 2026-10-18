# ==============================================================================
# Moroccan Salat & Iqama GNOME Extension Makefile
# Target: GNOME Shell 42.9
# ==============================================================================

UUID          := salat-timer@moroccan-habous
EXT_DIR       := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DIST_DIR      := dist
NODE          := $(shell if [ -d "$$HOME/.nvm/versions/node" ]; then ls -vd $$HOME/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1; elif command -v node >/dev/null 2>&1; then command -v node; else echo ""; fi)
TSC_BIN       := $(shell if [ -f ./node_modules/.bin/tsc ]; then echo "./node_modules/.bin/tsc"; elif command -v tsc >/dev/null 2>&1; then command -v tsc; elif [ -d "$$HOME/.nvm/versions/node" ]; then ls -vd $$HOME/.nvm/versions/node/*/bin/tsc 2>/dev/null | tail -n 1; else echo ""; fi)
HAS_TSC       := $(if $(TSC_BIN),1,0)

# Targeted specifically for GNOME 42.9
GNOME_VER     := 42.9

.PHONY: all compile compile-legacy compile-esm compile-all build install run uninstall prefs pack check logs clean distclean help re

all: install

# Run target: compiles (if TS present) or uses pre-compiled JS, installs, and refreshes
run: compile install
	@echo " 🚀 Extension ready and enabled!"


# Compile TS sources to ESM intermediate build
compile-esm:
	@echo " 🔨 Compiling TypeScript sources..."
	@mkdir -p $(DIST_DIR)/esm
	@if [ -n "$(NODE)" ] && [ -f ./node_modules/.bin/tsc ]; then \
		$(NODE) ./node_modules/.bin/tsc -p tsconfig.esm.json ; \
	elif command -v tsc >/dev/null 2>&1; then \
		tsc -p tsconfig.esm.json ; \
	elif [ -n "$(TSC_BIN)" ] && [ -n "$(NODE)" ]; then \
		$(NODE) $(TSC_BIN) -p tsconfig.esm.json ; \
	else \
		npx tsc -p tsconfig.esm.json ; \
	fi
	@cp -f src/metadata.json $(DIST_DIR)/esm/
	@cp -f mosque_pic.svg $(DIST_DIR)/esm/ 2>/dev/null || cp -f src/mosque_pic.svg $(DIST_DIR)/esm/
	@cp -f src/adan.mp3 $(DIST_DIR)/esm/ 2>/dev/null || cp -f src/adan.mp3 $(DIST_DIR)/esm/
	@echo "✔ TS compilation successful!"

# Build for GNOME Shell 42.9
compile-legacy: compile-esm
	@$(if $(NODE),$(NODE),node) scripts/transpile-legacy.js

# Compile TS if TypeScript is present; otherwise gracefully fallback to pre-compiled JS
compile:
	@if [ "$(HAS_TSC)" = "1" ] && [ -n "$(NODE)" ]; then \
		$(MAKE) compile-legacy ; \
	elif [ -f "$(DIST_DIR)/legacy/extension.js" ]; then \
		echo " ℹ TypeScript not installed on host machine. Using pre-compiled JavaScript in dist/legacy/..." ; \
	else \
		echo "❌ Error: TypeScript (tsc) is required to build from source, but was not found." ; \
		echo "   Please install dependencies with 'npm install' or provide pre-compiled files in dist/legacy/." ; \
		exit 1 ; \
	fi

build: compile

# Install extension for GNOME Shell 42.9 (No TypeScript or Node required)
install:
	@if [ ! -d "$(DIST_DIR)/legacy" ]; then \
		echo "❌ Error: '$(DIST_DIR)/legacy' directory not found. Please run 'make compile' first."; \
		exit 1; \
	fi
	@echo " 🚀 Installing extension from $(DIST_DIR)/legacy to $(EXT_DIR)..."
	@mkdir -p "$(EXT_DIR)"
	@cp -r $(DIST_DIR)/legacy/* "$(EXT_DIR)/"
	@echo " 🔄 Refreshing extension state..."
	@if command -v gnome-extensions > /dev/null 2>&1; then \
		gnome-extensions disable $(UUID) 2>/dev/null || true; \
		gnome-extensions enable $(UUID) 2>/dev/null || true; \
	fi
	@if pgrep gnome-shell > /dev/null 2>&1; then \
		echo " 🔄 Reloading GNOME Shell on X11..."; \
		kill -HUP $$(pgrep gnome-shell | xargs) 2>/dev/null || true; \
	fi
	@echo " 🔍 Verifying extension status..."
	@if command -v gnome-extensions > /dev/null 2>&1; then \
		gnome-extensions info $(UUID) 2>/dev/null || true; \
	fi
	@echo "✔ Installation and automated setup complete for GNOME $(GNOME_VER)!"

# Open Preferences Settings Window directly
prefs:
	@echo " ⚙ Opening extension preferences settings window..."
	@gnome-extensions prefs $(UUID)

# Disable and uninstall extension
uninstall:
	@echo " 🗑 Uninstalling extension $(UUID)..."
	@if command -v gnome-extensions > /dev/null 2>&1; then \
		gnome-extensions disable $(UUID) 2>/dev/null || true; \
	fi
	@rm -rf "$(EXT_DIR)"
	@echo "✔ Extension uninstalled."

# Package zip bundle for GNOME 42.9
pack: compile check
	@echo " 📦 Packaging extension zip bundle for GNOME 42.9..."
	@if command -v gnome-extensions > /dev/null 2>&1; then \
		gnome-extensions pack $(DIST_DIR)/legacy --force --out-dir=. --extra-source=metadata.json --extra-source=mosque_pic.svg --extra-source=adan.mp3 ; \
		cp -f $(UUID).shell-extension.zip $(UUID).zip 2>/dev/null || true ; \
	else \
		(cd $(DIST_DIR)/legacy && zip -r "../../$(UUID).zip" .) ; \
	fi
	@echo "✔ Created $(UUID).zip (GNOME Shell 42.9)"

# Check JavaScript syntax across compiled source files (if node is available)
check:
	@if [ -n "$(NODE)" ] && [ -d "$(DIST_DIR)/legacy" ]; then \
		echo " 🔍 Checking compiled JS syntax for GNOME 42.9..."; \
		for f in $(DIST_DIR)/legacy/*.js; do \
			[ -f "$$f" ] && $(NODE) -c "$$f" || exit 1; \
		done; \
		echo "✔ Compiled JS files passed syntax check!"; \
	else \
		echo " ℹ Skipping JS syntax check (Node.js check optional)."; \
	fi

# Display live extension logs from systemd journalctl
logs:
	@echo " 📜 Tailing live SalatExtension logs (Ctrl+C to stop)..."
	@journalctl -f -o cat /usr/bin/gnome-shell | grep --line-buffered -i "SalatExtension"

# Clean build artifacts (preserves dist/legacy so install works without TS)
clean:
	@rm -rf $(DIST_DIR)/esm *.zip
	@echo "✔ Cleaned transient build artifacts."

# Full clean including dist/
distclean:
	@rm -rf $(DIST_DIR) *.zip
	@echo "✔ Cleaned all build artifacts and dist directory."

help:
	@echo "Available Makefile targets for GNOME Shell 42.9:"
	@echo "  make install       - Install pre-compiled extension to ~/.local/share/gnome-shell/extensions/ (Zero dependencies, no TypeScript needed)"
	@echo "  make run           - Install & activate extension for current session"
	@echo "  make compile       - Compile TypeScript if available, or verify pre-compiled JS"
	@echo "  make pack          - Package .zip file for GNOME Shell 42.9"
	@echo "  make check         - Verify syntax across compiled JavaScript files"
	@echo "  make prefs         - Open extension Preferences window"
	@echo "  make uninstall     - Remove extension"
	@echo "  make clean         - Remove transient build artifacts"
	@echo "  make re            - Clean, compile, check, and reinstall"

re: clean compile check install
	@echo "✔ Rebuilt and reinstalled extension for GNOME Shell 42.9."
