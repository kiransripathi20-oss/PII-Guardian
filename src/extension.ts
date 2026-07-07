import * as vscode from 'vscode';
import { anonymizeText, analyzePii } from './piiEngine';
import { createChatParticipant } from './chatParticipant';
import { createPiiDecorator } from './piiDecorator';
import { DEFAULT_ENTITIES, filterEntitiesByTier, initializeTrial } from './license';
import { PiiEntityType, RedactMethod } from './piiTypes';

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('piiGuardian').get<T>(key) ?? defaultValue;
}

export function activate(context: vscode.ExtensionContext) {
  initializeTrial(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('pii-guardian.anonymizeSelection', () => anonymizeSelectionCommand()),
    vscode.commands.registerCommand('pii-guardian.anonymizeFile', () => anonymizeFileCommand()),
    vscode.commands.registerCommand('pii-guardian.deanonymizeSelection', () => deanonymizeSelectionCommand()),
    vscode.commands.registerCommand('pii-guardian.maskSelection', () => maskSelectionCommand()),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new GuardianInlineProvider()),
    vscode.languages.registerCodeActionsProvider({ pattern: '**' }, new AnonymizeCodeActionProvider(), {
      providedCodeActionKinds: AnonymizeCodeActionProvider.providedCodeActionKinds,
    }),
    vscode.languages.registerCodeLensProvider({ pattern: '**' }, new AnonymizeCodeLensProvider()),
  );

  const participant = createChatParticipant(context);
  if (participant) {
    context.subscriptions.push(participant);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('piiGuardian')) {
        vscode.window.showInformationMessage('PII Guardian configuration updated.');
      }
    })
  );

  createPiiDecorator(context);
}

function anonymizeFileCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return;
  }

  const text = editor.document.getText();
  if (!text) {
    vscode.window.showWarningMessage('File is empty.');
    return;
  }

  const entities = getConfig<PiiEntityType[]>('entities', DEFAULT_ENTITIES);
  const redactWith = getConfig<RedactMethod>('redactWith', 'placeholder');

  const result = anonymizeText(text, { entities, redactWith });

  if (result.entities.length === 0) {
    vscode.window.showInformationMessage('PII Guardian: No PII detected in file.');
    return;
  }

  editor.edit(editBuilder => {
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(text.length)
    );
    editBuilder.replace(fullRange, result.anonymizedText);
  });

  vscode.window.showInformationMessage(`PII Guardian: Redacted ${result.entities.length} PII item(s) in the file.`);
}

function anonymizeSelectionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return;
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection.isEmpty ? undefined : selection);

  if (!text) {
    vscode.window.showWarningMessage('No text selected.');
    return;
  }

  const entities = getConfig<PiiEntityType[]>('entities', DEFAULT_ENTITIES);
  const redactWith = getConfig<RedactMethod>('redactWith', 'placeholder');

  const result = anonymizeText(text, { entities, redactWith });

  editor.edit(editBuilder => {
    if (selection.isEmpty) {
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(text.length)
      );
      editBuilder.replace(fullRange, result.anonymizedText);
    } else {
      editBuilder.replace(selection, result.anonymizedText);
    }
  });

  if (result.entities.length > 0) {
    vscode.window.showInformationMessage(`PII Guardian: Redacted ${result.entities.length} PII item(s).`);
  } else {
    vscode.window.showInformationMessage('PII Guardian: No PII detected.');
  }
}

function maskSelectionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('Select text to mask.');
    return;
  }

  const label = getConfig<string>('maskLabel', 'Number');
  editor.edit(editBuilder => {
    editBuilder.replace(selection, `[${label}]`);
  });
  vscode.window.showInformationMessage(`PII Guardian: Replaced selection with [${label}].`);
}

function deanonymizeSelectionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return;
  }

  vscode.window.showInformationMessage(
    'PII Guardian: De-anonymization requires the original mapping from a prior anonymization session.',
    'Open Logs'
  );
}

class GuardianInlineProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    const isEnabled = getConfig<boolean>('enabled', true);
    if (!isEnabled) return undefined;

    const line = document.lineAt(position.line);

    if (line.text.length > 5 && line.text.length < 200) {
      const entities = getConfig<PiiEntityType[]>('entities', DEFAULT_ENTITIES);
      const result = anonymizeText(line.text, { entities });

      if (result.entities.length > 0) {
        const piiNotice = new vscode.InlineCompletionItem(
          ` // ⚠ PII detected in this line (${result.entities.map(e => e.type).join(', ')})`
        );
        return [piiNotice];
      }
    }

    return undefined;
  }
}

class AnonymizeCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] | undefined {
    const isEnabled = getConfig<boolean>('enabled', true);
    if (!isEnabled) return undefined;

    const actions: vscode.CodeAction[] = [];
    const maskLabel = getConfig<string>('maskLabel', 'Number');

    if (!range.isEmpty) {
      const text = document.getText(range);
      if (text) {
        const maskAction = new vscode.CodeAction(`Mask with [${maskLabel}]`, vscode.CodeActionKind.QuickFix);
        maskAction.edit = new vscode.WorkspaceEdit();
        maskAction.edit.replace(document.uri, range, `[${maskLabel}]`);
        actions.push(maskAction);

        const entities = getConfig<PiiEntityType[]>('entities', DEFAULT_ENTITIES);
        const redactWith = getConfig<RedactMethod>('redactWith', 'placeholder');
        const result = anonymizeText(text, { entities, redactWith });
        if (result.entities.length > 0) {
          const piiAction = new vscode.CodeAction('Anonymize PII in selection', vscode.CodeActionKind.QuickFix);
          piiAction.edit = new vscode.WorkspaceEdit();
          piiAction.edit.replace(document.uri, range, result.anonymizedText);
          actions.push(piiAction);
        }
      }
    } else {
      const cursorEntities = filterEntitiesByTier(getConfig<PiiEntityType[]>('entities', DEFAULT_ENTITIES));
      const line = document.lineAt(range.start.line);
      const offset = document.offsetAt(range.start);
      const piiEntities = analyzePii(line.text, cursorEntities);
      const lineStart = document.offsetAt(line.range.start);
      const entityAtCursor = piiEntities.find(
        e => offset >= lineStart + e.start && offset <= lineStart + e.end
      );
      if (entityAtCursor) {
        const targetRange = new vscode.Range(
          document.positionAt(lineStart + entityAtCursor.start),
          document.positionAt(lineStart + entityAtCursor.end),
        );
        const redactWith = getConfig<RedactMethod>('redactWith', 'placeholder');
        const result = anonymizeText(entityAtCursor.text, { redactWith });
        const action = new vscode.CodeAction('Anonymize this', vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, targetRange, result.anonymizedText);
        actions.push(action);
      }
    }

    return actions.length > 0 ? actions : undefined;
  }
}

class AnonymizeCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const isEnabled = getConfig<boolean>('enabled', true);
    if (!isEnabled || document.lineCount === 0) return [];

    const line0 = document.lineAt(0);
    const range = new vscode.Range(0, 0, 0, 0);

    return [
      new vscode.CodeLens(range, {
        title: '🔒 Anonymize this file',
        command: 'pii-guardian.anonymizeFile',
        arguments: [],
      }),
    ];
  }
}

export function deactivate() { }
