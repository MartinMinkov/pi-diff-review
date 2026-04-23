export interface MonacoRequire {
  (dependencies: string[], callback: () => void): void;
  config(config: Record<string, unknown>): void;
}

export interface MonacoPosition {
  lineNumber: number;
  column: number;
}

export interface MonacoVisibleRange {
  startLineNumber: number;
}

export interface MonacoSelection extends MonacoPosition {
  startLineNumber: number;
  endLineNumber: number;
}

export interface MonacoTextModel {
  uri: unknown;
  getValue(): string;
  getLanguageId?(): string;
  getValueInRange(range: MonacoSelection): string;
  dispose(): void;
}

export interface MonacoDecoration {
  range: unknown;
  options: {
    isWholeLine?: boolean;
    className?: string;
    glyphMarginClassName?: string;
  };
}

export interface MonacoViewZoneAccessor {
  addZone(zone: {
    afterLineNumber: number | null;
    heightInPx: number;
    domNode: HTMLElement;
  }): string;
  removeZone(id: string): void;
}

export interface MonacoMouseTarget {
  type: number;
  position?: {
    lineNumber?: number;
  };
}

export interface MonacoMouseEvent {
  target: MonacoMouseTarget;
}

export interface MonacoCodeEditor {
  getScrollTop(): number;
  getScrollLeft(): number;
  setScrollTop(value: number): void;
  setScrollLeft(value: number): void;
  changeViewZones(callback: (accessor: MonacoViewZoneAccessor) => void): void;
  deltaDecorations(
    oldDecorations: string[],
    newDecorations: MonacoDecoration[],
  ): string[];
  updateOptions(options: Record<string, unknown>): void;
  getPosition?(): MonacoPosition | null;
  getVisibleRanges?(): MonacoVisibleRange[];
  getModel?(): MonacoTextModel | null;
  revealLineInCenter(lineNumber: number): void;
  setPosition(position: MonacoPosition): void;
  focus(): void;
  getSelection?(): MonacoSelection | null;
  onMouseMove(listener: (event: MonacoMouseEvent) => void): void;
  onMouseLeave(listener: () => void): void;
  onMouseDown(listener: (event: MonacoMouseEvent) => void): void;
  onDidFocusEditorText(listener: () => void): void;
  onDidChangeCursorPosition(listener: () => void): void;
  onDidScrollChange(listener: () => void): void;
}

export interface MonacoDiffEditor {
  getOriginalEditor(): MonacoCodeEditor;
  getModifiedEditor(): MonacoCodeEditor;
  layout(dimension: { width: number; height: number }): void;
  updateOptions(options: Record<string, unknown>): void;
  setModel(models: {
    original: MonacoTextModel;
    modified: MonacoTextModel;
  }): void;
}

export interface MonacoCancellationToken {
  isCancellationRequested?: boolean;
}

export interface MonacoUriFactory {
  Uri: {
    from(input: {
      scheme: string;
      path: string;
      query: string;
    }): unknown;
  };
}

export interface MonacoApi extends MonacoUriFactory {
  Range: new (
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number,
  ) => unknown;
  editor: {
    MouseTargetType: {
      GUTTER_GLYPH_MARGIN: number;
      GUTTER_LINE_NUMBERS: number;
    };
    defineTheme(
      themeName: string,
      theme: {
        base: string;
        inherit: boolean;
        rules: unknown[];
        colors: Record<string, string>;
      },
    ): void;
    setTheme(themeName: string): void;
    createDiffEditor(
      container: HTMLElement,
      options: Record<string, unknown>,
    ): MonacoDiffEditor;
    createModel(
      content: string,
      language: string,
      uri?: unknown,
    ): MonacoTextModel;
    registerEditorOpener?(opener: {
      openCodeEditor(source: unknown, resource: unknown): boolean;
    }): void;
  };
  languages: {
    registerDefinitionProvider(
      languageId: string,
      provider: {
        provideDefinition(
          model: MonacoTextModel,
          position: MonacoPosition,
          token: MonacoCancellationToken,
        ): Promise<unknown> | unknown;
      },
    ): void;
    registerHoverProvider(
      languageId: string,
      provider: {
        provideHover(
          model: MonacoTextModel,
          position: MonacoPosition,
          token: MonacoCancellationToken,
        ): Promise<unknown> | unknown;
      },
    ): void;
  };
}
