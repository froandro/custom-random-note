// main.js
const { Plugin, PluginSettingTab, Setting, TFolder, ItemView, TFile, Modal, Notice } = require("obsidian");

const HISTORY_VIEW_TYPE = "custom-random-note-history";

module.exports = class CustomRandomNotePlugin extends Plugin {
    settings = {
        allowedFolders: [],
        ignoredFolders: [],
        autoOpenOnStartup: false,
        history: [],
        maxHistory: 10,
        trackAllNotes: true,
        hideHistoryPaths: false,
        clearHistoryOnUnload: false
    };

    ribbonIconRef = null;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new CustomRandomNoteSettingTab(this.app, this));

        this.addCommand({
            id: "open-random-note",
            name: "Open random note from folders",
            callback: () => this.openRandomNote()
        });

        this.ribbonIconRef = this.addRibbonIcon("dice", "Open Random Note", () => {
            this.openRandomNote();
        });

        this.registerView(
            HISTORY_VIEW_TYPE, 
            (leaf) => new HistoryView(leaf, this)
        );
        
        this.addRibbonIcon("history", "Open Note History", () => {
            this.activateHistoryView();
        });

        this.registerEvent(
            this.app.workspace.on("file-open", async (file) => {
                if (file instanceof TFile && file.extension === "md") {
                    await this.addToHistory(file, "Manual");
                }
            })
        );

        if (this.settings.autoOpenOnStartup) {
            setTimeout(() => {
                this.openRandomNote();
            }, 2000);
        }

        this.addStyle();
    }

    addStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .history-view-header {
                margin-left: 15px;
                margin-bottom: 12px;
                margin-top: 8px;
            }
            .history-container {
                max-height: 70vh;
                overflow-y: auto;
                padding-left: 15px;
            }
            .history-container .setting-item {
                padding-left: 5px;
                padding-right: 10px;
            }
            .history-empty-message {
                margin-left: 15px;
                color: var(--text-muted);
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }

    async activateHistoryView() {
        let leaf = this.app.workspace.getLeavesOfType(HISTORY_VIEW_TYPE)[0];
        
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: HISTORY_VIEW_TYPE,
                active: true
            });
        }
        
        this.app.workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, this.settings, loadedData);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async openRandomNote() {
        const { allowedFolders, ignoredFolders } = this.settings;
    
        const files = this.app.vault.getMarkdownFiles().filter(file => {
            const path = file.path;
            const inAllowedFolder = allowedFolders.length === 0 || 
                allowedFolders.some(folder => path === folder || path.startsWith(folder + "/"));
            const inIgnoredFolder = ignoredFolders.length > 0 && 
                ignoredFolders.some(folder => path === folder || path.startsWith(folder + "/"));
    
            return inAllowedFolder && !inIgnoredFolder;
        });
    
        if (files.length === 0) {
            new Notice("No notes found in the specified folders.");
            return;
        }
    
        const randomIndex = Math.floor(Math.random() * files.length);
        const fileToOpen = files[randomIndex];
    
        await this.addToHistory(fileToOpen, "Random");
        this.app.workspace.getLeaf().openFile(fileToOpen);
        new Notice(`Opened: ${fileToOpen.basename}`);
    }

    async addToHistory(file, type = "Manual") {
        if (!this.settings.trackAllNotes && type === "Manual") return;
    
        const existingIndex = this.settings.history.findIndex(note => note.path === file.path);
        
        if (existingIndex >= 0) {
            this.settings.history.splice(existingIndex, 1);
        }
        
        this.settings.history.unshift({
            path: file.path,
            basename: file.basename,
            type
        });
        
        if (this.settings.history.length > this.settings.maxHistory) {
            this.settings.history = this.settings.history.slice(0, this.settings.maxHistory);
        }
        
        await this.saveSettings();
        this.updateHistoryView();
    }

    updateHistoryView() {
        const leaves = this.app.workspace.getLeavesOfType(HISTORY_VIEW_TYPE);
        if (leaves.length > 0) {
            const view = leaves[0].view;
            if (view instanceof HistoryView) {
                view.updateHistory();
            }
        }
    }

    async onunload() {
        if (this.settings.clearHistoryOnUnload) {
            this.settings.history = [];
            await this.saveSettings();
        }
    }
};

class CustomRandomNoteSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl("h2", { text: "Custom Random Note Settings" });

        const folderPaths = this.plugin.app.vault.getAllLoadedFiles()
            .filter(f => f instanceof TFolder && f.path !== "" && f.path !== "/")
            .map(f => f.path);

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

        new Setting(containerEl)
            .setName("Track all opened notes")
            .setDesc("Records every opened note in history, not just random ones.")
            .addToggle(cb => {
                cb.setValue(this.plugin.settings.trackAllNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.trackAllNotes = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Hide file paths in history")
            .setDesc("Use this to protect privacy when sharing your vault.")
            .addToggle(cb => {
                cb.setValue(this.plugin.settings.hideHistoryPaths)
                    .onChange(async (value) => {
                        this.plugin.settings.hideHistoryPaths = value;
                        await this.plugin.saveSettings();
                        this.plugin.updateHistoryView();
                    });
            });

        new Setting(containerEl)
            .setName("Maximum history items")
            .setDesc("Maximum number of items to keep in history.")
            .addSlider(slider => {
                slider
                    .setLimits(5, 50, 5)
                    .setValue(this.plugin.settings.maxHistory)
                    .onChange(async (value) => {
                        this.plugin.settings.maxHistory = value;
                        await this.plugin.saveSettings();
                    });
                slider.setDynamicTooltip();
            });

        new Setting(containerEl)
            .setName("Allowed Folders")
            .setDesc("Select folders to include in random selection")
            .addButton(cb => {
                cb.setButtonText("Select Folders")
                    .onClick(() => {
                        new FolderMultiSelectModal(
                            this.plugin.app, 
                            folderPaths, 
                            this.plugin.settings.allowedFolders, 
                            (result) => {
                                this.plugin.settings.allowedFolders = result;
                                this.plugin.saveSettings();
                            }
                        ).open();
                    });
            });

        new Setting(containerEl)
            .setName("Ignored Folders")
            .setDesc("Select folders to exclude from random selection")
            .addButton(cb => {
                cb.setButtonText("Select Folders")
                    .onClick(() => {
                        new FolderMultiSelectModal(
                            this.plugin.app, 
                            folderPaths, 
                            this.plugin.settings.ignoredFolders, 
                            (result) => {
                                this.plugin.settings.ignoredFolders = result;
                                this.plugin.saveSettings();
                            }
                        ).open();
                    });
            });

        new Setting(containerEl)
            .setName("Clear history on plugin unload")
            .setDesc("Automatically clear history when disabling the plugin")
            .addToggle(cb => {
                cb.setValue(this.plugin.settings.clearHistoryOnUnload)
                    .onChange(async (value) => {
                        this.plugin.settings.clearHistoryOnUnload = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Clear History Now")
            .setDesc("Immediately remove all history entries")
            .addButton(cb => {
                cb.setButtonText("Clear History")
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.history = [];
                        await this.plugin.saveSettings();
                        this.plugin.updateHistoryView();
                        new Notice("History cleared");
                    });
            });
    }
}

class HistoryView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return HISTORY_VIEW_TYPE;
    }

    getDisplayText() {
        return "Random Note History";
    }

    getIcon() {
        return "history";
    }

    async onOpen() {
        this.containerEl.empty();
        this.containerEl.createEl("h3", { 
            text: "History of Opened Notes",
            cls: "history-view-header"
        });
        
        this.historyContainer = this.containerEl.createEl("div", { cls: "history-container" });
        
        await this.updateHistory();
    }

    async updateHistory() {
        if (!this.historyContainer) return;
        
        this.historyContainer.empty();
        const { history, hideHistoryPaths } = this.plugin.settings;

        if (history.length === 0) {
            this.historyContainer.createEl("p", { 
                text: "No history yet.",
                cls: "history-empty-message"
            });
            return;
        }

        for (const note of history) {
            const setting = new Setting(this.historyContainer)
                .setName(note.basename)
                .addButton(btn => {
                    btn.setButtonText("Open")
                        .onClick(() => {
                            const file = this.plugin.app.vault.getMarkdownFiles()
                                .find(f => f.path === note.path);
                            if (file) {
                                this.plugin.app.workspace.getLeaf().openFile(file);
                            } else {
                                new Notice("Note not found in vault");
                            }
                        });
                });

            if (!hideHistoryPaths) {
                setting.setDesc(note.path);
            }
        }
    }

    async onClose() {
        this.containerEl.empty();
    }
}

class FolderMultiSelectModal extends Modal {
    constructor(app, folderPaths, selectedFolders, onSubmit) {
        super(app);
        this.folderPaths = folderPaths;
        this.selectedFolders = new Set(selectedFolders);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "Select Folders" });

        this.folderPaths.forEach(path => {
            new Setting(contentEl)
                .setName(path)
                .addToggle(toggle => {
                    toggle.setValue(this.selectedFolders.has(path))
                        .onChange(selected => {
                            if (selected) {
                                this.selectedFolders.add(path);
                            } else {
                                this.selectedFolders.delete(path);
                            }
                        });
                });
        });

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText("Confirm")
                    .onClick(() => {
                        this.onSubmit(Array.from(this.selectedFolders));
                        this.close();
                    });
            })
            .addButton(btn => {
                btn.setButtonText("Cancel")
                    .onClick(() => this.close());
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}