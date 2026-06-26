import * as vscode from 'vscode';
import { anonymizeText, analyzePii } from './piiEngine';
import { createChatParticipant } from './chatParticipant';
import { createPiiDecorator } from './piiDecorator';
import { isFeatureEnabled, filterEntitiesByTier } from './license';
import { PiiEntityType, RedactMethod } from './piiTypes';

function getConfig<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('piiGuardian').get<T>(key) ?? defaultValue;
}

export function activate(context: vscode.ExtensionContext) {
  showWelcomeIfFirstRun(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('pii-guardian.anonymizeSelection', () => anonymizeSelectionCommand()),
    vscode.commands.registerCommand('pii-guardian.deanonymizeSelection', () => deanonymizeSelectionCommand()),
    ...(isFeatureEnabled('inline-warnings')
      ? [vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new GuardianInlineProvider())]
      : []),
    vscode.languages.registerCodeActionsProvider({ pattern: '**' }, new AnonymizeCodeActionProvider(), {
      providedCodeActionKinds: AnonymizeCodeActionProvider.providedCodeActionKinds,
    }),
  );

  if (isFeatureEnabled('chat-participant')) {
    const participant = createChatParticipant(context);
    if (participant) {
      context.subscriptions.push(participant);
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('piiGuardian')) {
        vscode.window.showInformationMessage('PII Guardian configuration updated.');
      }
    })
  );

  createPiiDecorator(context);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(shield) PII Guardian';
  statusBar.tooltip = 'PII Guardian';
  statusBar.command = 'pii-guardian.anonymizeSelection';
  statusBar.show();
  context.subscriptions.push(statusBar);
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

  const entities = getConfig<PiiEntityType[]>('entities', ['EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN', 'IP_ADDRESS', 'PERSON']);
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
      const entities = getConfig<PiiEntityType[]>('entities', ['EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN', 'IP_ADDRESS', 'PERSON']);
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

    let text: string;
    let targetRange: vscode.Range;

    if (!range.isEmpty) {
      text = document.getText(range);
      targetRange = range;
    } else {
      const entities = filterEntitiesByTier(getConfig<PiiEntityType[]>('entities', ['EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN', 'IP_ADDRESS', 'PERSON']));
      const line = document.lineAt(range.start.line);
      const offset = document.offsetAt(range.start);
      const piiEntities = analyzePii(line.text, entities);
      const lineStart = document.offsetAt(line.range.start);
      const entityAtCursor = piiEntities.find(
        e => offset >= lineStart + e.start && offset <= lineStart + e.end
      );
      if (!entityAtCursor) return undefined;
      text = entityAtCursor.text;
      targetRange = new vscode.Range(
        document.positionAt(lineStart + entityAtCursor.start),
        document.positionAt(lineStart + entityAtCursor.end),
      );
    }

    if (!text) return undefined;

    const redactWith = getConfig<RedactMethod>('redactWith', 'placeholder');

    const result = anonymizeText(text, { redactWith });
    if (result.entities.length === 0) return undefined;

    const action = new vscode.CodeAction('Anonymize this', vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, targetRange, result.anonymizedText);
    return [action];
  }
}

function showWelcomeIfFirstRun(context: vscode.ExtensionContext) {
  const hasSeenWelcome = context.globalState.get<boolean>('piiGuardian.welcomeShown', false);
  if (hasSeenWelcome) return;

  context.globalState.update('piiGuardian.welcomeShown', true);

  const tier = isFeatureEnabled('inline-warnings') ? 'Pro' : 'Free';
  vscode.window.showInformationMessage(
    `PII Guardian (${tier}) installed — PII in your editor is now highlighted. Click to learn more.`,
    'Learn More'
  ).then(selection => {
    if (selection === 'Learn More') {
      vscode.commands.executeCommand(
        'markdown.showPreview',
        vscode.Uri.joinPath(context.extensionUri, 'README.md')
      );
    }
  });
}

export function deactivate() { }
