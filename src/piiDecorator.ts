import * as vscode from 'vscode';
import { analyzePii } from './piiEngine';
import { DEFAULT_ENTITIES, filterEntitiesByTier } from './license';
import { PiiEntityType } from './piiTypes';

const piiDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 140, 0, 0.18)',
  border: '1px solid rgba(255, 140, 0, 0.5)',
  borderRadius: '3px',
  overviewRulerColor: 'rgba(255, 140, 0, 0.8)',
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export function updatePiiDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor) {
    return;
  }

  const isEnabled = vscode.workspace.getConfiguration('piiGuardian').get<boolean>('enabled', true);
  if (!isEnabled) {
    editor.setDecorations(piiDecorationType, []);
    return;
  }

  const text = editor.document.getText();
  if (!text) {
    editor.setDecorations(piiDecorationType, []);
    return;
  }

  const entities = filterEntitiesByTier(vscode.workspace.getConfiguration('piiGuardian').get<PiiEntityType[]>('entities', DEFAULT_ENTITIES));

  const piiEntities = analyzePii(text, entities);

  const decorations = piiEntities.map(entity => {
    const startPos = editor.document.positionAt(entity.start);
    const endPos = editor.document.positionAt(entity.end);
    const range = new vscode.Range(startPos, endPos);

    return {
      range,
      hoverMessage: `**PII Guardian** — PII detected: ${entity.type} _(confidence: ${Math.round(entity.score * 100)}%)_`,
    };
  });

  editor.setDecorations(piiDecorationType, decorations);
}

export function createPiiDecorator(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      updatePiiDecorations(editor);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        updatePiiDecorations(editor);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('piiGuardian')) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          updatePiiDecorations(editor);
        }
      }
    })
  );

  if (vscode.window.activeTextEditor) {
    updatePiiDecorations(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(piiDecorationType);
}
