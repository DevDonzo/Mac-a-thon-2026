const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const logger = require('./logger');

/**
 * AST-based Code Parser for Symbol Extraction
 * Extracts functions, classes, imports, exports, and their relationships
 */
class ASTParser {
    constructor() {
        this.symbols = [];
        this.dependencies = [];
    }

    /**
     * Parse a file and extract symbols
     */
    parseFile(filePath, content, language = 'javascript') {
        const symbols = [];
        const imports = [];
        const exports = [];

        try {
            // Skip non-parseable files
            if (!this.isParseableLanguage(language)) {
                return { symbols, imports, exports };
            }

            const ast = this.parse(content, language);
            if (!ast) return { symbols, imports, exports };

            traverse(ast, {
                // Extract function declarations
                FunctionDeclaration(path) {
                    symbols.push({
                        type: 'function',
                        name: path.node.id?.name || 'anonymous',
                        line: path.node.loc?.start.line || 0,
                        params: path.node.params.map(p => p.name || ''),
                        async: path.node.async,
                        generator: path.node.generator
                    });
                },

                // Extract class declarations
                ClassDeclaration(path) {
                    const methods = [];
                    path.traverse({
                        ClassMethod(methodPath) {
                            methods.push({
                                name: methodPath.node.key.name,
                                kind: methodPath.node.kind,
                                static: methodPath.node.static,
                                async: methodPath.node.async
                            });
                        }
                    });

                    symbols.push({
                        type: 'class',
                        name: path.node.id?.name || 'anonymous',
                        line: path.node.loc?.start.line || 0,
                        methods,
                        superClass: path.node.superClass?.name || null
                    });
                },

                // Extract arrow functions and function expressions assigned to variables
                VariableDeclarator(path) {
                    const init = path.node.init;
                    if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
                        symbols.push({
                            type: 'function',
                            name: path.node.id?.name || 'anonymous',
                            line: path.node.loc?.start.line || 0,
                            arrow: init.type === 'ArrowFunctionExpression',
                            async: init.async,
                            params: init.params.map(p => p.name || '')
                        });
                    } else if (path.node.id?.name) {
                        symbols.push({
                            type: 'variable',
                            name: path.node.id.name,
                            line: path.node.loc?.start.line || 0,
                            const: path.parent.kind === 'const'
                        });
                    }
                },

                // Extract imports
                ImportDeclaration(path) {
                    const source = path.node.source.value;
                    const specifiers = path.node.specifiers.map(s => ({
                        type: s.type,
                        imported: s.imported?.name || s.local?.name || 'default',
                        local: s.local?.name
                    }));

                    imports.push({
                        source,
                        specifiers,
                        line: path.node.loc?.start.line || 0
                    });
                },

                // Extract exports
                ExportNamedDeclaration(path) {
                    if (path.node.declaration) {
                        const decl = path.node.declaration;
                        if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
                            exports.push({
                                type: 'named',
                                name: decl.id?.name,
                                line: path.node.loc?.start.line || 0
                            });
                        } else if (decl.type === 'VariableDeclaration') {
                            decl.declarations.forEach(d => {
                                exports.push({
                                    type: 'named',
                                    name: d.id?.name,
                                    line: path.node.loc?.start.line || 0
                                });
                            });
                        }
                    }
                },

                ExportDefaultDeclaration(path) {
                    const decl = path.node.declaration;
                    exports.push({
                        type: 'default',
                        name: decl.id?.name || decl.name || 'default',
                        line: path.node.loc?.start.line || 0
                    });
                }
            });

            return { symbols, imports, exports };
        } catch (error) {
            logger.warn(`AST parsing failed for ${filePath}`, { error: error.message });
            return { symbols, imports, exports };
        }
    }

    /**
     * Parse content into AST
     */
    parse(content, language) {
        try {
            const plugins = [];

            // Add plugins based on language
            if (language === 'typescript' || language.includes('tsx')) {
                plugins.push('typescript');
            }
            if (language.includes('jsx') || language.includes('tsx')) {
                plugins.push('jsx');
            }

            return parser.parse(content, {
                sourceType: 'module',
                plugins: [
                    ...plugins,
                    'decorators-legacy',
                    'classProperties',
                    'objectRestSpread',
                    'asyncGenerators',
                    'dynamicImport',
                    'optionalChaining',
                    'nullishCoalescingOperator'
                ],
                errorRecovery: true
            });
        } catch (error) {
            // Try unambiguous if module fails
            try {
                return parser.parse(content, {
                    sourceType: 'unambiguous',
                    errorRecovery: true
                });
            } catch (err) {
                return null;
            }
        }
    }

    /**
     * Check if language is parseable
     */
    isParseableLanguage(language) {
        const parseable = ['javascript', 'typescript', 'jsx', 'tsx', 'js', 'ts'];
        return parseable.some(l => language.toLowerCase().includes(l));
    }

    /**
     * Create chunks based on AST symbols (function/class boundaries)
     */
    createSymbolBasedChunks(filePath, content, language) {
        const chunks = [];
        
        try {
            if (!this.isParseableLanguage(language)) {
                // Fall back to line-based chunking for non-JS files
                return this.createLineBasedChunks(filePath, content);
            }

            const { symbols } = this.parseFile(filePath, content, language);
            const lines = content.split('\n');

            if (symbols.length === 0) {
                return this.createLineBasedChunks(filePath, content);
            }

            // Use only high-signal boundaries to avoid over-fragmenting files into tiny chunks.
            const boundarySymbols = symbols
                .filter((symbol) => symbol.type === 'function' || symbol.type === 'class')
                .sort((a, b) => a.line - b.line);

            if (boundarySymbols.length === 0) {
                return this.createLineBasedChunks(filePath, content);
            }

            // Create chunks for each symbol
            for (let i = 0; i < boundarySymbols.length; i++) {
                const symbol = boundarySymbols[i];
                const startLine = symbol.line - 1; // 0-indexed
                const endLine = i < boundarySymbols.length - 1 ? boundarySymbols[i + 1].line - 2 : lines.length - 1;

                const chunkLines = lines.slice(startLine, endLine + 1);
                const chunkText = chunkLines.join('\n').trim();

                if (chunkText.length > 50) { // Only include meaningful chunks
                    chunks.push({
                        text: chunkText,
                        path: filePath,
                        startLine: startLine + 1,
                        endLine: endLine + 1,
                        symbol: {
                            type: symbol.type,
                            name: symbol.name
                        }
                    });
                }
            }

            return chunks.length > 0 ? chunks : this.createLineBasedChunks(filePath, content);
        } catch (error) {
            logger.warn(`Symbol-based chunking failed for ${filePath}, using fallback`, { error: error.message });
            return this.createLineBasedChunks(filePath, content);
        }
    }

    /**
     * Fallback: line-based chunking
     */
    createLineBasedChunks(filePath, content) {
        const chunks = [];
        const lines = content.split('\n');
        const linesPerChunk = 50;

        for (let i = 0; i < lines.length; i += linesPerChunk) {
            const chunkLines = lines.slice(i, i + linesPerChunk);
            const chunkText = chunkLines.join('\n').trim();

            if (chunkText.length > 50) {
                chunks.push({
                    text: chunkText,
                    path: filePath,
                    startLine: i + 1,
                    endLine: Math.min(i + linesPerChunk, lines.length)
                });
            }
        }

        return chunks;
    }
}

module.exports = new ASTParser();
