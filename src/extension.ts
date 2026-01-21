import * as vscode from 'vscode';
import { TextDecoder } from 'util';

export function activate(context: vscode.ExtensionContext) {

    let disposable = vscode.commands.registerCommand('gemini-copy-helper.copyContext', async () => {
        
        const editor = vscode.window.activeTextEditor;
        const notebookEditor = vscode.window.activeNotebookEditor;
        
        let code = "";
        let errorContent = "";
        let promptIntro = "";
        let source = ""; 

        // ==========================================
        // 场景 1: Jupyter Notebook (.ipynb) - 保持全自动
        // ==========================================
        if (notebookEditor) {
            const notebook = notebookEditor.notebook;
            // 获取所有代码 (拼接)
            code = notebook.getCells()
                .filter(cell => cell.kind === vscode.NotebookCellKind.Code)
                .map(cell => cell.document.getText())
                .join('\n\n# -- Next Cell --\n\n');

            // 自动寻找 Notebook 里的结构化报错
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
        
        // ==========================================
        // 场景 2: 普通代码文件 (.py, .js 等) - 选中优先 + 静态检查
        // ==========================================
        else if (editor) {
            const document = editor.document;
            code = document.getText();

            // 2.1 优先：检查用户是否手动选中了文字 (比如终端里的报错)
            const selection = editor.selection;
            const selectedText = document.getText(selection);

            if (selectedText.trim().length > 0) {
                // 如果用户选中了东西，我们认为这肯定是最重要的报错信息
                errorContent = `【用户手动选中的报错/内容】：\n${selectedText}\n`;
                source = "User Selection";
            } 
            else {
                // 2.2 其次：如果没有选中，检查编辑器里有没有红波浪线 (静态语法错误)
                const diagnostics = vscode.languages.getDiagnostics(document.uri);
                const staticErrors = diagnostics
                    .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                    .map(d => `[Line ${d.range.start.line + 1}] ${d.message}`)
                    .join('\n');

                if (staticErrors.length > 0) {
                    errorContent += `【编辑器静态检测报错】：\n${staticErrors}\n\n`;
                    source = "Static Analysis";
                }
                // 这里删除了之前的“暴力抓取终端”逻辑
            }
        }

        // ==========================================
        // 生成 Prompt
        // ==========================================
        
        // 智能设置开场白
        if (source === "User Selection") {
            promptIntro = "我运行代码遇到了问题（见下方选中的报错信息），请帮我分析并修复。";
        } else if (source === "Notebook Auto-Detect") {
            promptIntro = "我的 Notebook 单元格运行报错了，请根据堆栈信息修复代码。";
        } else if (source === "Static Analysis") {
            promptIntro = "编辑器提示我的代码有语法错误（红波浪线），请帮我修复。";
        } else {
            promptIntro = "请帮我检查这段代码的逻辑或潜在问题（当前未检测到显式报错）。";
            errorContent = "(未检测到报错信息，且未选中任何内容)";
        }

        const prompt = `${promptIntro}

${errorContent}

【代码上下文】：
\`\`\`
${code.substring(0, 10000)}
\`\`\`

请直接给出修复后的代码，并解释原因。`;

        // 写入剪贴板
        await vscode.env.clipboard.writeText(prompt);
        
        // 提示用户
        if (source) {
            vscode.window.showInformationMessage(`✅ 已复制！(来源: ${source})`);
        } else {
            vscode.window.showWarningMessage('⚠️ 已复制代码。如果是终端报错，请先【选中报错文字】再按快捷键！');
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}