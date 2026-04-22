# Windows Desktop Installer Manual Checklist

## Scope

Use this checklist after a fresh `NSIS Setup.exe` build for the desktop beta channel. The goal is to verify the interactive install and uninstall flow that the silent smoke script cannot cover.

## Install flow

1. Launch the newest `Setup.exe`.
2. Confirm the installer header icon uses the desktop brand mark instead of the default Electron icon.
3. Confirm the installer exposes a browsable install directory step instead of forcing the default path.
4. Change the install path to a custom non-default directory and confirm the summary/install step reflects the new path.
5. Toggle desktop shortcut creation and confirm the choice is respected after installation.
6. Keep "run after finish" enabled once, and disable it once on a second pass.
7. Confirm the installed app launches to the branded startup shell instead of a blank white window.

## First launch flow

1. Check that the branded splash appears within the first half second after clicking the installed shortcut.
2. Confirm the main window background never flashes a pure white empty frame.
3. If no model provider is configured, confirm the desktop-specific setup guidance points to the existing settings page.
4. If a model provider is configured, confirm the app reaches the normal writing workspace.
5. Open Settings and confirm the desktop update card shows the current binary version and update status.

## Shortcut and shell integration

1. Confirm the desktop shortcut uses the branded icon.
2. Confirm the Start Menu shortcut uses the branded icon.
3. Confirm the taskbar icon uses the branded icon while the app is running.
4. Confirm the installed executable icon in Explorer uses the branded icon.

## Uninstall and reinstall flow

1. Run the uninstaller from Apps & Features or the Start Menu uninstall entry.
2. Confirm the uninstall flow removes program files and shortcuts.
3. Confirm the user data directory is not deleted by default.
4. Reinstall the same build and confirm the previous user data is still readable.

## Update flow

1. Install an older NSIS beta build.
2. Launch the app and let the background update check run.
3. Confirm a newer GitHub prerelease is detected without blocking entry into the app.
4. Confirm the user must explicitly approve the download.
5. Confirm the download completes and the restart/install prompt appears.
6. Restart and confirm the newer installed version is running.
