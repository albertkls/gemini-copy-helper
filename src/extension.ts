import * as vscode from 'vscode';
import { TextDecoder } from 'util';

// 辅助等待函数
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function activate(context: vscode.ExtensionContext) {

    let disposable = vscode.commands.registerCommand('gemini-copy-helper.copyContext', async () => {
        
        // 1. 获取当前代码编辑器 (即使焦点在终端，通常也能获取到最近的编辑器)
        const editor = vscode.window.activeTextEditor;
        const notebookEditor = vscode.window.activeNotebookEditor;
        
        let code = "";
        let errorContent = "";
        let promptIntro = "";
        let source = ""; 

        // ==========================================
        // 步骤 A: 尝试获取终端/手动选中的内容 (关键修复)
        // ==========================================
        
        // 技巧：不管你在哪里，先尝试执行“复制选中内容”
        // 如果你在终端里选中了报错，这行命令会把它复制到剪贴板
        // 如果你在编辑器里选中了代码，这行命令也会工作
        await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
        // 极短的延迟，确保系统剪贴板更新
        await wait(50); 
        
        // 读取刚才“偷”到的内容
        const clipboardText = await vscode.env.clipboard.readText();

        // ==========================================
        // 步骤 B: 正常的逻辑判断
        // ==========================================

        if (notebookEditor) {
            // ... (Notebook 逻辑保持不变，全自动) ...
            const notebook = notebookEditor.notebook;
            code = notebook.getCells()
                .filter(cell => cell.kind === vscode.NotebookCellKind.Code)
                .map(cell => cell.document.getText())
                .join('\n\n# -- Next Cell --\n\n');

            for (const cell of notebook.getCells()) {
                for (const output of cell.outputs) {
                    const errorItem = output.items.find(i => i.mime === 'application/vnd.code.notebook.error');
                    if (errorItem) {
                        try {
                            const errorJson = JSON.parse(new TextDecoder().decode(errorItem.data));
                            const traceback = Array.isArray(errorJson.stack) ? errorJson.stack.join('\n') : String(errorJson);
                            errorContent += `【Notebook 自动检测报错】:\n${traceback}\n\n`;
                            source = "Notebook Auto-Detect";
                        } catch (e) {}
                    }
                }
            }
        } 
        else if (editor) {
            const document = editor.document;
            code = document.getText();

            // 判断剪贴板里的内容是不是刚才复制的报错
            // 逻辑：如果剪贴板有内容，且跟编辑器里选中的不一样（说明来自终端），或者编辑器本身就没选中
            const editorSelection = document.getText(editor.selection);
            
            if (clipboardText && clipboardText.trim().length > 0 && clipboardText !== editorSelection) {
                // 此时剪贴板里的东西很可能是用户在终端里选中的
                errorContent = `【用户选中的报错信息 (来自终端/Output)】：\n${clipboardText}\n`;
                source = "Terminal Selection";
            } 
            else if (editorSelection.length > 0) {
                 // 用户在编辑器里选中的
                errorContent = `【用户手动选中的代码/注释】：\n${editorSelection}\n`;
                source = "Editor Selection";
            }
            else {
                // 既没选中终端，也没选中编辑器，这就去抓红线
                const diagnostics = vscode.languages.getDiagnostics(document.uri);
                const staticErrors = diagnostics
                    .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                    .map(d => `[Line ${d.range.start.line + 1}] ${d.message}`)
                    .join('\n');

                if (staticErrors.length > 0) {
                    errorContent += `【编辑器静态检测报错】：\n${staticErrors}\n\n`;
                    source = "Static Analysis";
                }
            }
        }

        // ==========================================
        // 步骤 C: 生成 Prompt
        // ==========================================
        
        if (source.includes("Selection") || source.includes("Notebook")) {
            promptIntro = "我运行代码遇到了问题（见下方报错信息），请帮我分析并修复。";
        } else if (source === "Static Analysis") {
            promptIntro = "编辑器提示我的代码有语法错误，请帮我修复。";
        } else {
            promptIntro = "请帮我检查这段代码的逻辑或潜在问题。";
            errorContent = "(未检测到显式报错，且未选中任何内容)";
        }

        const prompt = `${promptIntro}

${errorContent}

【代码上下文】：
\`\`\`
${code.substring(0, 10000)}
\`\`\`

请直接给出修复后的代码，并解释原因。`;

        // 最终写入
        await vscode.env.clipboard.writeText(prompt);
        
        if (source) {
            vscode.window.showInformationMessage(`✅ 已复制！(来源: ${source})`);
        } else {
            vscode.window.showWarningMessage('⚠️ 已复制代码。建议先【选中终端报错】再按快捷键！');
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}