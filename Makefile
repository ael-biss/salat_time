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


# Compile TS sources to temporary build
compile-ts:
	@echo " 🔨 Compiling TypeScript sources..."
	@mkdir -p .build-tmp
	@if [ -f ./node_modules/typescript/lib/tsc.js ]; then \
		node ./node_modules/typescript/lib/tsc.js -p tsconfig.esm.json ; \
	elif command -v tsc >/dev/null 2>&1; then \
		tsc -p tsconfig.esm.json ; \
	else \
		npx tsc -p tsconfig.esm.json ; \
	fi
	@cp -f src/metadata.json .build-tmp/
	@cp -f mosque_pic.svg .build-tmp/ 2>/dev/null || cp -f src/mosque_pic.svg .build-tmp/
	@cp -f src/adan.mp3 .build-tmp/ 2>/dev/null || cp -f src/adan.mp3 .build-tmp/
	@cp -f src/schedule_window.py .build-tmp/ 2>/dev/null || true
	@chmod +x .build-tmp/schedule_window.py 2>/dev/null || true
	@cp -f src/play_audio.py .build-tmp/ 2>/dev/null || true
	@chmod +x .build-tmp/play_audio.py 2>/dev/null || true
	@cp -f src/stylesheet.css .build-tmp/ 2>/dev/null || true
	@echo "✔ TS compilation successful!"

# Compile and generate extension for GNOME Shell 42.9 directly in dist/
compile:
	@if [ "$(HAS_TSC)" = "1" ] && [ -n "$(NODE)" ]; then \
		$(MAKE) compile-ts ; \
		$(if $(NODE),$(NODE),node) scripts/transpile-legacy.js ; \
	elif [ -f "$(DIST_DIR)/extension.js" ]; then \
		echo " ℹ TypeScript not installed on host machine. Using pre-compiled JavaScript in dist/..." ; \
	else \
		echo "❌ Error: TypeScript (tsc) is required to build from source, but was not found." ; \
		echo "   Please install dependencies with 'npm install' or provide pre-compiled files in dist/." ; \
		exit 1 ; \
	fi

build: compile

# Install extension for GNOME Shell 42.9 directly from dist/
install:
	@if [ ! -f "$(DIST_DIR)/extension.js" ]; then \
		echo "❌ Error: '$(DIST_DIR)/extension.js' not found. Please run 'make compile' first."; \
		exit 1; \
	fi
	@echo " 🚀 Installing extension from $(DIST_DIR) to $(EXT_DIR)..."
	@mkdir -p "$(EXT_DIR)"
	@cp -r $(DIST_DIR)/* "$(EXT_DIR)/"
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
		gnome-extensions pack $(DIST_DIR) --force --out-dir=. --extra-source=metadata.json --extra-source=mosque_pic.svg --extra-source=adan.mp3 ; \
		cp -f $(UUID).shell-extension.zip $(UUID).zip 2>/dev/null || true ; \
	else \
		(cd $(DIST_DIR) && zip -r "../$(UUID).zip" .) ; \
	fi
	@echo "✔ Created $(UUID).zip (GNOME Shell 42.9)"

# Check JavaScript syntax across compiled source files (if node is available)
check:
	@if [ -n "$(NODE)" ] && [ -d "$(DIST_DIR)" ]; then \
		echo " 🔍 Checking compiled JS syntax for GNOME 42.9..."; \
		for f in $(DIST_DIR)/*.js; do \
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

# Clean build artifacts (preserves dist/ so install works without TS)
clean:
	@rm -rf .build-tmp *.zip
	@echo "✔ Cleaned transient build artifacts."

# Full clean including dist/
distclean:
	@rm -rf $(DIST_DIR) .build-tmp *.zip
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
