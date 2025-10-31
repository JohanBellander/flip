export type IssueSeverity = 'error' | 'warn' | 'info';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  message: string;
  jsonPointer?: string;
  nodeId?: string;
}

export interface ValidateResult<T> {
  issues: Issue[];
  normalized: T | null;
}

type AnyObject = Record<string, unknown>;

const ALLOWED_NODE_TYPES = new Set([
  'Stack',
  'Grid',
  'Box',
  'Text',
  'Button',
  'Field',
  'Form',
  'Table'
]);

const WIDTH_HEIGHT_POLICIES = new Set(['hug', 'fill', 'fixed']);

function isObject(value: unknown): value is AnyObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateScaffold(scaffold: unknown): ValidateResult<AnyObject> {
  const issues: Issue[] = [];
  if (!isObject(scaffold)) {
    issues.push({ id: 'schema-not-object', severity: 'error', message: 'Top-level must be an object' });
    return { issues, normalized: null };
  }

  // schemaVersion
  const schemaVersion = scaffold['schemaVersion'];
  if (schemaVersion !== '1.0.0') {
    issues.push({ id: 'schema-version-unsupported', severity: 'error', message: 'schemaVersion must equal "1.0.0"' });
  }

  // screen
  const screen = scaffold['screen'];
  if (!isObject(screen)) {
    issues.push({ id: 'schema-missing-field', severity: 'error', message: 'screen must be an object' });
  } else {
    if (typeof screen['id'] !== 'string' || screen['id'].trim() === '') {
      issues.push({ id: 'schema-missing-field', severity: 'error', message: 'screen.id must be a non-empty string', jsonPointer: '/screen/id' });
    }
    if (!isObject(screen['root'])) {
      issues.push({ id: 'schema-missing-field', severity: 'error', message: 'screen.root must be a node object', jsonPointer: '/screen/root' });
    }
  }

  // settings
  const settings = scaffold['settings'];
  if (!isObject(settings)) {
    issues.push({ id: 'schema-missing-field', severity: 'error', message: 'settings must be an object' });
  }

  // Node traversal and validation
  const nodeIdSet = new Set<string>();
  function addIssue(issue: Issue) { issues.push(issue); }

  function validateNode(node: AnyObject, pointer: string) {
    const nodeId = typeof node['id'] === 'string' ? node['id'] : undefined;
    if (typeof nodeId !== 'string' || nodeId.trim() === '') {
      addIssue({ id: 'schema-missing-field', severity: 'error', message: 'node.id must be a non-empty string', jsonPointer: pointer + '/id' });
    } else {
      if (nodeIdSet.has(nodeId)) {
        addIssue({ id: 'duplicate-node-id', severity: 'error', message: `Duplicate node id '${nodeId}'`, nodeId });
      }
      nodeIdSet.add(nodeId);
    }

    const type = node['type'];
    if (typeof type !== 'string' || !ALLOWED_NODE_TYPES.has(type)) {
      addIssue({ id: 'invalid-enum', severity: 'error', message: `node.type must be one of ${Array.from(ALLOWED_NODE_TYPES).join(', ')}`, jsonPointer: pointer + '/type', nodeId });
    }

    // width/height policies if present
    const widthPolicy = node['widthPolicy'];
    if (typeof widthPolicy !== 'undefined' && (typeof widthPolicy !== 'string' || !WIDTH_HEIGHT_POLICIES.has(widthPolicy))) {
      addIssue({ id: 'invalid-enum', severity: 'error', message: 'widthPolicy must be hug|fill|fixed', jsonPointer: pointer + '/widthPolicy', nodeId });
    }
    const heightPolicy = node['heightPolicy'];
    if (typeof heightPolicy !== 'undefined' && (typeof heightPolicy !== 'string' || !WIDTH_HEIGHT_POLICIES.has(heightPolicy))) {
      addIssue({ id: 'invalid-enum', severity: 'error', message: 'heightPolicy must be hug|fill|fixed', jsonPointer: pointer + '/heightPolicy', nodeId });
    }

    // Type-specific validation
    switch (type) {
      case 'Stack': {
        const children = node['children'];
        if (!Array.isArray(children)) {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Stack.children must be an array', jsonPointer: pointer + '/children', nodeId });
        }
        break;
      }
      case 'Grid': {
        const children = node['children'];
        if (!Array.isArray(children)) {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Grid.children must be an array', jsonPointer: pointer + '/children', nodeId });
        }
        break;
      }
      case 'Box': {
        if (!isObject(node['child'])) {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Box.child must be a node', jsonPointer: pointer + '/child', nodeId });
        }
        break;
      }
      case 'Text': {
        if (typeof node['text'] !== 'string' || node['text'].trim() === '') {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Text.text must be non-empty', jsonPointer: pointer + '/text', nodeId });
        }
        break;
      }
      case 'Button': {
        // No required fields besides type; enforce minSize in layout stage
        break;
      }
      case 'Field': {
        if (typeof node['label'] !== 'string' || node['label'].trim() === '') {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Field.label must be non-empty', jsonPointer: pointer + '/label', nodeId });
        }
        break;
      }
      case 'Form': {
        const fields = node['fields'];
        const actions = node['actions'];
        const states = node['states'];
        if (!Array.isArray(fields) || fields.length === 0) {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Form.fields must be non-empty', jsonPointer: pointer + '/fields', nodeId });
        }
        if (!Array.isArray(actions) || actions.length === 0) {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Form.actions must be non-empty', jsonPointer: pointer + '/actions', nodeId });
        }
        if (!Array.isArray(states) || !states.includes('default')) {
          addIssue({ id: 'invalid-enum', severity: 'error', message: 'Form.states must include "default"', jsonPointer: pointer + '/states', nodeId });
        }
        break;
      }
      case 'Table': {
        if (typeof node['title'] !== 'string' || node['title'].trim() === '') {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Table.title must be non-empty', jsonPointer: pointer + '/title', nodeId });
        }
        if (!Array.isArray(node['columns']) || node['columns'].length === 0 || !node['columns'].every(c => typeof c === 'string')) {
          addIssue({ id: 'schema-missing-field', severity: 'error', message: 'Table.columns must be non-empty string array', jsonPointer: pointer + '/columns', nodeId });
        }
        const responsive = node['responsive'];
        if (isObject(responsive)) {
          const strategy = responsive['strategy'];
          if (strategy !== 'wrap' && strategy !== 'scroll' && strategy !== 'cards') {
            addIssue({ id: 'invalid-enum', severity: 'error', message: 'Table.responsive.strategy must be wrap|scroll|cards', jsonPointer: pointer + '/responsive/strategy', nodeId });
          }
        }
        break;
      }
    }

    // Recurse into children
    if (type === 'Stack' || type === 'Grid') {
      const children = Array.isArray(node['children']) ? node['children'] : [];
      children.forEach((child, idx) => {
        if (isObject(child)) validateNode(child, `${pointer}/children/${idx}`);
      });
    } else if (type === 'Box') {
      const child = node['child'];
      if (isObject(child)) validateNode(child, `${pointer}/child`);
    } else if (type === 'Form') {
      const fields = Array.isArray(node['fields']) ? node['fields'] : [];
      fields.forEach((f, idx) => { if (isObject(f)) validateNode(f, `${pointer}/fields/${idx}`); });
      const actions = Array.isArray(node['actions']) ? node['actions'] : [];
      actions.forEach((a, idx) => { if (isObject(a)) validateNode(a, `${pointer}/actions/${idx}`); });
    }
  }

  if (isObject(screen) && isObject(screen['root'])) {
    validateNode(screen['root'] as AnyObject, '/screen/root');
  }

  // settings validations used across nodes
  if (isObject(settings)) {
    const spacing = settings['spacingScale'];
    if (!Array.isArray(spacing) || spacing.length === 0 || !spacing.every(v => Number.isInteger(v))) {
      issues.push({ id: 'invalid-spacing-scale', severity: 'error', message: 'settings.spacingScale must be an array of integers', jsonPointer: '/settings/spacingScale' });
    }
    const minTouch = settings['minTouchTarget'];
    if (!isObject(minTouch) || typeof minTouch['w'] !== 'number' || typeof minTouch['h'] !== 'number' || minTouch['w'] < 44 || minTouch['h'] < 44) {
      issues.push({ id: 'invalid-min-touch', severity: 'error', message: 'settings.minTouchTarget must be an object with w,h >= 44', jsonPointer: '/settings/minTouchTarget' });
    }
    const bps = settings['breakpoints'];
    if (!Array.isArray(bps) || bps.length === 0 || !bps.every(isWxH)) {
      issues.push({ id: 'invalid-breakpoints', severity: 'error', message: 'settings.breakpoints must be ["WxH", ...]', jsonPointer: '/settings/breakpoints' });
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const normalized = hasErrors ? null : (scaffold as AnyObject);
  return { issues, normalized };
}

function isWxH(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const m = s.match(/^(\d+)x(\d+)$/);
  if (!m) return false;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  return w > 0 && h > 0;
}


