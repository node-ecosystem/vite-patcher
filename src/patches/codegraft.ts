import type { GrammarId, RichNode } from '@codegraft/core'
import { Parser, wrapNode } from '@codegraft/core/internal'

export type SyntaxNode = RichNode

export const Lang = {
  JavaScript: 'javascript',
  TypeScript: 'typescript'
} as const satisfies Record<string, GrammarId>

export const parseRoot = async (lang: GrammarId, code: string) => {
  await Parser.init()
  await Parser.loadGrammar(lang)

  const tree = Parser.parse(code, lang)
  return wrapNode(tree.rootNode, lang, 0)
}

export const findAll = (
  root: SyntaxNode,
  type: string,
  predicate: (node: SyntaxNode) => boolean = () => true
) => {
  const matches: SyntaxNode[] = []

  const visit = (node: SyntaxNode) => {
    for (const child of node.children) {
      if (child.type === type && predicate(child)) {
        matches.push(child)
      }
      visit(child)
    }
  }

  visit(root)
  return matches
}

export const find = (
  root: SyntaxNode,
  type: string,
  predicate?: (node: SyntaxNode) => boolean
) => findAll(root, type, predicate).at(0) ?? null

export const getField = (node: SyntaxNode, field: string) => {
  return node.child(field as never)
}

export const getCallFunctionName = (node: SyntaxNode) => {
  const fn = getField(node, 'function') ?? node.children[0]
  return fn?.text
}

export const getDefaultExportValue = (root: SyntaxNode) => {
  const exportStatement = find(root, 'export_statement', node => node.text.trimStart().startsWith('export default'))
  return exportStatement?.children.at(-1) ?? null
}
