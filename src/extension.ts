import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    console.log('Gemini Copy Helper 插件已启动！');

    // 注册命令：这个 ID 必须和 package.json 里的 "command" 一模一样
    let disposable = vscode.commands.registerCommand('gemini-copy-helper.copyContext', () => {
        
        // 1. 获取当前编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('请先打开一个代码文件！');
            return;
        }

        const document = editor.document;
        
        // 2. 获取报错信息 (只获取 Error 级别的红色报错)
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const errors = diagnostics
            .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
            .map(d => `[Line ${d.range.start.line + 1}] ${d.message}`)
            .join('\n');

        // 3. 获取代码内容
        const code = document.getText(); 
        
        // 4. 判断有没有报错，生成不同的提示前缀
        let errorSection = errors.length > 0 
            ? `【报错信息 (请重点修复这里)】：\n${errors}\n\n` 
            : `(当前文件无显式报错，请帮我检查逻辑或优化)\n\n`;

        // 5. 拼接 Prompt
        const prompt = `我正在使用 Trae 开发，遇到了问题，请帮我分析并修复。

${errorSection}
【相关代码文件】：
\`\`\`
${code}
\`\`\`

请直接给出修复后的代码，并解释原因。`;

        // 6. 写入剪贴板
        vscode.env.clipboard.writeText(prompt).then(() => {
            vscode.window.showInformationMessage('✅ 已复制上下文！请去 Gemini 网页版粘贴 (Ctrl+V)');
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}