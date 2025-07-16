// main.js

const { Plugin, PluginSettingTab, Modal, Setting, TFolder } = require("obsidian");

module.exports = class CustomRandomNotePlugin extends Plugin {
    settings = {
        allowedFolders: [],
        ignoredFolders: [],
        autoOpenOnStartup: false
    };

    ribbonIconRef = null;

    async onload() {
        await this.loadSettings();

        // Добавляем вкладку настроек
        this.addSettingTab(new CustomRandomNoteSettingTab(this.app, this));

        this.addCommand({
            id: "open-random-note",
            name: "Open random note from folders",
            callback: () => this.openRandomNote()
        });

        this.ribbonIconRef = this.addRibbonIcon("dice", "Open Random Note", () => {
            this.openRandomNote();
        });

        // Автозапуск при старте Obsidian
        if (this.settings.autoOpenOnStartup) {
            setTimeout(() => {
                this.openRandomNote();
            }, 2000);
        }
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            {
                allowedFolders: [],
                ignoredFolders: [],
                autoOpenOnStartup: false
            },
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    openRandomNote() {
        const { allowedFolders, ignoredFolders } = this.settings;

        const files = this.app.vault.getMarkdownFiles().filter(file => {
            const path = file.path;

            const inAllowedFolder = allowedFolders.length === 0 || allowedFolders.some(folder => path.startsWith(folder));
            const inIgnoredFolder = ignoredFolders.length > 0 && ignoredFolders.some(folder => path.startsWith(folder));

            return inAllowedFolder && !inIgnoredFolder;
        });

        if (files.length === 0) {
            new Notice("No notes found in the specified folders.");
            return;
        }

        const randomIndex = Math.floor(Math.random() * files.length);
        const fileToOpen = files[randomIndex];

        this.app.workspace.getLeaf().openFile(fileToOpen);
        new Notice(`Opened: ${fileToOpen.basename}`);
    }
}

class CustomRandomNoteSettingTab extends PluginSettingTab {
    plugin;

    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl("h2", { text: "Custom Random Note Settings" });

        const folderPaths = this.app.vault.getAllLoadedFiles()
            .filter(f => f instanceof TFolder)
            .map(f => f.path);

        // --- Настройка автозапуска ---
        new Setting(containerEl)
            .setName("Auto-open random note on startup")
            .setDesc("Automatically opens a random note when Obsidian starts.")
            .addToggle(cb => {
                cb.setValue(this.plugin.settings.autoOpenOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.autoOpenOnStartup = value;
                        await this.plugin.saveSettings();
                    });
            });

        // --- Разрешённые папки (мультиселект с чекбоксами) ---
        new Setting(containerEl)
            .setName("Allowed Folders")
            .setDesc("Select multiple folders to include")
            .addButton(cb => {
                cb.setButtonText("Choose Folders")
                    .setTooltip("Select multiple folders")
                    .onClick(() => {
                        new FolderMultiSelectModal(this.app, folderPaths, this.plugin.settings.allowedFolders, (result) => {
                            this.plugin.settings.allowedFolders = result;
                            this.plugin.saveSettings();
                            this.display(); // Обновляем настройки
                        }).open();
                    });
            });

        // --- Исключённые папки (мультиселект с чекбоксами) ---
        new Setting(containerEl)
            .setName("Ignored Folders")
            .setDesc("Select multiple folders to exclude")
            .addButton(cb => {
                cb.setButtonText("Choose Folders")
                    .setTooltip("Select multiple folders")
                    .onClick(() => {
                        new FolderMultiSelectModal(this.app, folderPaths, this.plugin.settings.ignoredFolders, (result) => {
                            this.plugin.settings.ignoredFolders = result;
                            this.plugin.saveSettings();
                            this.display(); // Обновляем настройки
                        }).open();
                    });
            });
    }
}

// === Модальное окно с чекбоксами для выбора нескольких папок ===
class FolderMultiSelectModal extends Modal {
    constructor(app, folderPaths, selectedFolders, onSubmit) {
        super(app);
        this.folderPaths = folderPaths;
        this.selectedFolders = selectedFolders;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.empty();
        contentEl.createEl("h3", { text: "Select Folders" });

        const selectedSet = new Set(this.selectedFolders);

        this.folderPaths.forEach(path => {
            new Setting(contentEl)
                .setName(path)
                .addToggle(cb => {
                    cb.setValue(selectedSet.has(path))
                        .onChange((value) => {
                            if (value) {
                                selectedSet.add(path);
                            } else {
                                selectedSet.delete(path);
                            }
                        });
                });
        });

        new Setting(contentEl)
            .addButton(cb => {
                cb.setButtonText("Confirm")
                    .setCta()
                    .onClick(() => {
                        this.onSubmit([...selectedSet]);
                        this.close();
                    });
            })
            .addButton(cb => {
                cb.setButtonText("Cancel")
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}