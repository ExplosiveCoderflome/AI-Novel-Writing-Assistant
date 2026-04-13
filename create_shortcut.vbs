Set WshShell = CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut("C:\Users\fa\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\AI-Novel-Writing-Assistant.lnk")
shortcut.TargetPath = "C:\Users\fa\Documents\trae\aixiaoshuo\AI-Novel-Writing-Assistant\startup.bat"
shortcut.WorkingDirectory = "C:\Users\fa\Documents\trae\aixiaoshuo\AI-Novel-Writing-Assistant"
shortcut.Save