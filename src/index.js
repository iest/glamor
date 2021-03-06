/**** stylesheet  ****/

import { StyleSheet } from './sheet.js'
import { createMarkupForStyles } from './CSSPropertyOperations'
import clean from './clean.js'

export const styleSheet = new StyleSheet()
// an isomorphic StyleSheet shim. hides all the nitty gritty.

// /**************** LIFTOFF IN 3... 2... 1... ****************/
                        styleSheet.inject()                     //eslint-disable-line indent
// /****************      TO THE MOOOOOOON     ****************/

// convenience function to toggle speedy
export function speedy(bool) {
  return styleSheet.speedy(bool)
}


// plugins
import { PluginSet, prefixes, fallbacks, positionSticky } from './plugins' // we include these by default
export const plugins = styleSheet.plugins = new PluginSet(prefixes, positionSticky, fallbacks)
plugins.media = new PluginSet() // neat! media, font-face, keyframes
plugins.fontFace = new PluginSet()
plugins.keyframes = new PluginSet(prefixes)

// define some constants
const isBrowser = typeof window !== 'undefined'
const isDev = (process.env.NODE_ENV === 'development') || !process.env.NODE_ENV
const isTest = process.env.NODE_ENV === 'test'

/**** simulations  ****/

// a flag to enable simulation meta tags on dom nodes
// defaults to true in dev mode. recommend *not* to
// toggle often.
let canSimulate = isDev

// we use these flags for issuing warnings when simulate is called
// in prod / in incorrect order
let warned1 = false, warned2 = false

// toggles simulation activity. shouldn't be needed in most cases
export function simulations(bool = true) {
  canSimulate = !!bool
}

// use this on dom nodes to 'simulate' pseudoclasses
// <div {...hover({ color: 'red' })} {...simulate('hover', 'visited')}>...</div>
// you can even send in some weird ones, as long as it's in simple format
// and matches an existing rule on the element
// eg simulate('nthChild2', ':hover:active') etc
export function simulate(...pseudos) {
  pseudos = clean(pseudos)
  if (!pseudos) return {}
  if(!canSimulate) {
    if(!warned1) {
      console.warn('can\'t simulate without once calling simulations(true)') //eslint-disable-line no-console
      warned1 = true
    }
    if(!isDev && !isTest && !warned2) {
      console.warn('don\'t use simulation outside dev') //eslint-disable-line no-console
      warned2 = true
    }
    return {}
  }
  return pseudos.reduce((o, p) => (o[`data-simulate-${simple(p)}`] = '', o), {})
}

/**** labels ****/
// toggle for debug labels.
// *shouldn't* have to mess with this manually
let hasLabels = isDev

export function cssLabels(bool) {
  hasLabels = !!bool
}

// takes a string, converts to lowercase, strips out nonalphanumeric.
function simple(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// flatten a nested array
function flatten(inArr) {
  let arr = []
  for(let i=0; i<inArr.length; i++) {
    if(Array.isArray(inArr[i]))
      arr = arr.concat(flatten(inArr[i]))
    else
      arr = arr.concat(inArr[i])
  }
  return arr
}

// hashes a string to something 'unique'
// we use this to generate ids for styles
import hash from './hash'

function hashify(...objs) {
  return hash(objs.map(x => JSON.stringify(x)).join('')).toString(36)
}


// of shape { 'data-css-<id>': ''}
export function isLikeRule(rule) {
  let keys = Object.keys(rule).filter(x => x !== 'toString')
  if(keys.length !== 1) {
    return false
  }
  return !!/data\-css\-([a-zA-Z0-9]+)/.exec(keys[0])
}

// extracts id from a { 'data-css-<id>': ''} like object
export function idFor(rule) {
  let keys = Object.keys(rule).filter(x => x !== 'toString')
  if(keys.length !== 1) throw new Error('not a rule')
  let regex = /data\-css\-([a-zA-Z0-9]+)/
  let match = regex.exec(keys[0])
  if(!match) throw new Error('not a rule')
  return match[1]
}


// a simple cache to store generated rules
let registered =  styleSheet.registered = {}
function register(spec) {
  if(!registered[spec.id]) {
    registered[spec.id] = spec
  }
}

// semi-deeply merge 2 'mega' style objects
function deepMergeStyles(dest, src) {
  Object.keys(src).forEach(expr => {
    dest[expr] = dest[expr] || {}
    Object.keys(src[expr]).forEach(type => {
      dest[expr][type] = dest[expr][type] || {}
      Object.assign(dest[expr][type], src[expr][type])
    })
  })
}


//todo - prevent nested media queries
function deconstruct(obj) {
  let ret = [], composesWith
  let plain = {}, hasPlain = false
  let isSpecial = obj && find(Object.keys(obj), x =>
    (x.charAt(0) === ':') || // pseudos
    (x.charAt(0) === '@') || // media queries; todo - check @media
    (x.indexOf('&') >= 0) || // 'selects'
    (x === 'composes') // like css modules!
  )

  if(isSpecial) {
    Object.keys(obj).forEach(key => {
      if(key === 'composes') {
        composesWith = obj[key]
      }
      else if(key.charAt(0) === ':') {
        ret.push({
          type: 'pseudo',
          style: obj[key],
          selector: key
        })
      }
      else if (key.charAt(0) === '@') {
        ret.push({
          type: 'media',
          rules: deconstruct(obj[key]),
          expr: key.substring(6)
        })
      }
      else if((key.indexOf('&') >= 0) || (typeof obj[key] === 'object')) {
        ret.push({
          type: 'select',
          style: Array.isArray(obj[key]) ? Object.assign({}, ...obj[key]) : obj[key],
          selector: key
        })
      }      
      else {
        hasPlain = true
        plain[key] = obj[key]
      }
    })
    ret = hasPlain ? [ plain, ...ret ] : ret
    ret = composesWith ? [ composesWith, ...ret ] : ret
    return ret
  }
  return obj

}


function _getRegistered(rule) {
  if(isLikeRule(rule)) {
    let ret = registered[idFor(rule)]
    if(ret == null) {
      throw new Error('[glamor] an unexpected rule cache miss occurred. This is probably a sign of multiple glamor instances in your app. See https://github.com/threepointone/glamor/issues/79')
    }
    return ret
  }
  return rule
}

// extracts and composes styles from a rule into a 'mega' style
// with sub styles keyed by media query + 'path'
function extractStyles(...rules) {

  rules = flatten(rules)
  let exprs = {}
  // converts {[data-css-<id>]} to the backing rule

  rules = rules
    .map(_getRegistered)
    .map(x =>((x.type === 'style') || !x.type) ? deconstruct(x.style || x) : x
    )

  rules = flatten(rules)
    .map(_getRegistered) // sigh, this is to handle arrays in `composes`. must make better.

  rules.forEach(rule => {
    // avoid possible label. todo - cleaner
    if(typeof rule === 'string') {
      return
    }
    switch(rule.type) {
      case 'raw': throw new Error('not implemented')
      case 'font-face': throw new Error('not implemented')
      case 'keyframes': throw new Error('not implemented')

      case 'merge': return deepMergeStyles(exprs,
        extractStyles(rule.rules))

      case 'pseudo':
        if((rule.selector === ':hover') && exprs._ && exprs._['%%%:active'] && !exprs._['%%%:hover']) {
          console.warn(':active must come after :hover to work correctly') //eslint-disable-line no-console
        }
        return deepMergeStyles(exprs,
        { _: { ['%%%' + rule.selector]: rule.style } })
      case 'select': return deepMergeStyles(exprs,
        { _: { ['^^^' + rule.selector]: rule.style } })
      case 'parent': return deepMergeStyles(exprs,
        { _: { ['***' + rule.selector]: rule.style } })

      case 'style': return deepMergeStyles(exprs,
        { _: { _: rule.style } })

      case 'media': return deepMergeStyles(exprs,
        { [rule.expr]: extractStyles(rule.rules)._ })

      default: return deepMergeStyles(exprs,
        { _: { _: rule } })
    }
  })
  return exprs

}

// extract label from a rule / style
function extractLabel(rule) {
  if(isLikeRule(rule)) {
    rule = registered[idFor(rule)]
  }
  return rule.label || '{:}'
}

// given an id / 'path', generate a css selector
function selector(id, path) {
  if(path === '_') return `.css-${id},[data-css-${id}]`

  if(path.indexOf('%%%') === 0) {
    let x =`.css-${id}${path.slice(3)},[data-css-${id}]${path.slice(3)}`
    if(canSimulate) x+= `,.css-${id}[data-simulate-${simple(path)}],[data-css-${id}][data-simulate-${simple(path)}]`
    return x
  }

  if(path.indexOf('***') === 0) {
    return path.slice(3)
      .split(',')
      .map(x => `${x} .css-${id},${x} [data-css-${id}]`)
      .join(',')
  }
  if(path.indexOf('^^^') === 0) {
    return path.slice(3)
      .split(',')
      .map(x => x.indexOf('&') >= 0 ?
        [ x.replace(/\&/mg, `.css-${id}`), x.replace(/\&/mg, `[data-css-${id}]`) ].join(',') // todo - make sure each sub selector has an &
        : `.css-${id}${x},[data-css-${id}]${x}`)
      .join(',')
  }

}


function toCSS({ selector, style }) {
  let result = plugins.transform({ selector, style })
  return `${result.selector}{${createMarkupForStyles(result.style) }}`
}

function ruleToAst(rule) {
  let styles = extractStyles(rule)
  return Object.keys(styles).reduce((o, expr) => {
    o[expr] = Object.keys(styles[expr]).map(s =>
      ({ selector: selector(rule.id, s), style: styles[expr][s] }))
    return o
  }, {})
}

function ruleToCSS(spec) {
  let css = []
  let ast = ruleToAst(spec)
  // plugins here
  let { _, ...exprs } = ast
  if(_) {
    _.map(toCSS).forEach(str => css.push(str))
  }
  Object.keys(exprs).forEach(expr => {
    css.push(`@media ${expr}{${exprs[expr].map(toCSS).join('')}}`)
  })
  return css
}

// this cache to track which rules have
// been inserted into the stylesheet
let inserted = styleSheet.inserted = {}

// and helpers to insert rules into said styleSheet
function insert(spec) {
  if(!inserted[spec.id]) {
    inserted[spec.id] = true
    ruleToCSS(spec).map(cssRule =>
      styleSheet.insert(cssRule))
  }
}

export function insertRule(css) {
  let spec = {
    id: hashify(css),
    css,
    type: 'raw',
    label: '^'
  }
  register(spec)
  if(!inserted[spec.id]) {
    styleSheet.insert(spec.css)
    inserted[spec.id] = true
  }
}

export function insertGlobal(selector, style) {
  return insertRule(`${selector}{${createMarkupForStyles(style)}}`)
}

function insertKeyframe(spec) {
  if(!inserted[spec.id]) {
    let inner = Object.keys(spec.keyframes).map(kf => {
      let result = plugins.keyframes.transform({ id: spec.id, name: kf, style: spec.keyframes[kf] })
      return `${result.name}{${ createMarkupForStyles(result.style) }}`
    }).join('');

    [ '-webkit-', '-moz-', '-o-', '' ].forEach(prefix =>
      styleSheet.insert(`@${ prefix }keyframes ${ spec.name + '_' + spec.id }{${ inner }}`))

    inserted[spec.id] = true
  }
}

function insertFontFace(spec) {
  if(!inserted[spec.id]) {
    styleSheet.insert(`@font-face{${createMarkupForStyles(spec.font)}}`)
    inserted[spec.id] = true
  }
}

// rehydrate the insertion cache with ids sent from
// renderStatic / renderStaticOptimized
export function rehydrate(ids) {
  // load up ids
  Object.assign(inserted, ids.reduce((o, i) => (o[i] = true, o), {}) )
  // assume css loaded separately
}


// todo - perf
let ruleCache = {}
function toRule(spec) {
  register(spec)
  insert(spec)
  if(ruleCache[spec.id]) {
    return ruleCache[spec.id]
  }

  let ret = { [`data-css-${spec.id}`]: hasLabels ? spec.label || '' : '' }
  Object.defineProperty(ret, 'toString', {
    enumerable: false, value() { return 'css-' + spec.id }
  })
  ruleCache[spec.id] = ret
  return ret
}

// clears out the cache and empties the stylesheet
// best for tests, though there might be some value for SSR.

export function flush() {
  inserted = styleSheet.inserted = {}
  registered = styleSheet.registered = {}
  ruleCache = {}
  styleSheet.flush()
  styleSheet.inject()

}


function find(arr, fn) {
  for(let i=0; i < arr.length; i++) {
    if(fn(arr[i]) === true) {
      return true
    }
  }
  return false
}

export function style(obj) {
  obj = clean(obj)

  return obj ? toRule({
    id: hashify(obj),
    type: 'style',
    style: obj,
    label: obj.label || '*'
  }) : {}
}

// unique feature
// when you need to define 'real' css (whatever that may be)
// https://twitter.com/threepointone/status/756585907877273600
// https://twitter.com/threepointone/status/756986938033254400
export function select(selector, obj) {
  if(typeof selector === 'object') {
    return style(selector)
  }
  obj = clean(obj)

  return obj ? toRule({
    id: hashify(selector, obj),
    type: 'select',
    selector,
    style: obj,
    label: obj.label || '*'
  }) : {}
}

export const $ = select // bringin' jquery back

export function parent(selector, obj) {
  obj = clean(obj)
  return obj ? toRule({
    id: hashify(selector, obj),
    type: 'parent',
    selector,
    style: obj,
    label: obj.label || '*'
  }) : {}
}

// we define a function to 'merge' styles together.
// backstory - because of a browser quirk, multiple styles are applied in the order they're
// defined in the stylesheet, not in the order of application
// in most cases, this won't case an issue UNTIL IT DOES
// instead, use merge() to merge styles,
// with latter styles gaining precedence over former ones

export function merge(...rules) {
  rules = clean(rules)
  return rules ? toRule({
    id: hashify(extractStyles(rules)),
    type: 'merge',
    rules,
    label: '[' + (typeof rules[0] === 'string' ? rules[0] : rules.map(extractLabel).join(' + '))  + ']'
  }) : {}
}

export const compose = merge

export function media(expr, ...rules) {
  rules = clean(rules)
  return rules ? toRule({
    id: hashify(expr, extractStyles(rules)),
    type: 'media',
    rules,
    expr,
    label: '*mq(' + rules.map(extractLabel).join(' + ') + ')'
  }) : {}
}

export const presets = {
  mobile : '(min-width: 400px)',
  phablet : '(min-width: 550px)',
  tablet : '(min-width: 750px)',
  desktop : '(min-width: 1000px)',
  hd : '(min-width: 1200px)'
}

/**** live media query labels ****/

// simplest implementation -
// cycle through the cache, and for every media query
// find matching elements and update the label
function updateMediaQueryLabels() {
  Object.keys(registered).forEach(id => {
    let { expr } = registered[id]
    if(expr && hasLabels && window.matchMedia) {
      let els = document.querySelectorAll(`[data-css-${id}]`)
      let match = window.matchMedia(expr).matches ? '✓': '✕'
      let regex = /^(✓|✕|\*)mq/;
      [ ...els ].forEach(el => el.setAttribute(`data-css-${id}`,
        el.getAttribute(`data-css-${id}`).replace(regex, `${match}mq`)))
    }
  })
}

// saves a reference to the loop we trigger
let interval

export function trackMediaQueryLabels(bool = true, period = 2000) {
  if(bool) {
    if(interval) {
      console.warn('already tracking labels, call trackMediaQueryLabels(false) to stop') // eslint-disable-line no-console
      return
    }
    interval = setInterval(() =>
      updateMediaQueryLabels(), period)
  }
  else {
    clearInterval(interval)
    interval = null
  }

}

// in dev mode, start this up immediately
if(isDev && isBrowser) {
  trackMediaQueryLabels(true)
  // todo - make sure hot loading isn't broken
  // todo - clearInterval on browser close
}


export function pseudo(selector, obj) {
  obj = clean(obj)
  return obj ? toRule({
    id: hashify(selector, obj),
    type: 'pseudo',
    selector,
    style: obj,
    label: obj.label || ':*'
  }) : {}
}

// allllll the pseudoclasses

export function active(x) {
  return pseudo(':active', x)
}

export function any(x) {
  return pseudo(':any', x)
}

export function checked(x) {
  return pseudo(':checked', x)
}

export function disabled(x) {
  return pseudo(':disabled', x)
}

export function empty(x) {
  return pseudo(':empty', x)
}

export function enabled(x) {
  return pseudo(':enabled', x)
}

export function _default(x) {
  return pseudo(':default', x) // note '_default' name
}

export function first(x) {
  return pseudo(':first', x)
}

export function firstChild(x) {
  return pseudo(':first-child', x)
}

export function firstOfType(x) {
  return pseudo(':first-of-type', x)
}

export function fullscreen(x) {
  return pseudo(':fullscreen', x)
}

export function focus(x) {
  return pseudo(':focus', x)
}

export function hover(x) {
  return pseudo(':hover', x)
}

export function indeterminate(x) {
  return pseudo(':indeterminate', x)
}

export function inRange(x) {
  return pseudo(':in-range', x)
}

export function invalid(x) {
  return pseudo(':invalid', x)
}

export function lastChild(x) {
  return pseudo(':last-child', x)
}

export function lastOfType(x) {
  return pseudo(':last-of-type', x)
}

export function left(x) {
  return pseudo(':left', x)
}

export function link(x) {
  return pseudo(':link', x)
}

export function onlyChild(x) {
  return pseudo(':only-child', x)
}

export function onlyOfType(x) {
  return pseudo(':only-of-type', x)
}

export function optional(x) {
  return pseudo(':optional', x)
}

export function outOfRange(x) {
  return pseudo(':out-of-range', x)
}

export function readOnly(x) {
  return pseudo(':read-only', x)
}

export function readWrite(x) {
  return pseudo(':read-write', x)
}

export function required(x) {
  return pseudo(':required', x)
}

export function right(x) {
  return pseudo(':right', x)
}

export function root(x) {
  return pseudo(':root', x)
}

export function scope(x) {
  return pseudo(':scope', x)
}

export function target(x) {
  return pseudo(':target', x)
}

export function valid(x) {
  return pseudo(':valid', x)
}

export function visited(x) {
  return pseudo(':visited', x)
}

// parameterized pseudoclasses
export function dir(p, x) {
  return pseudo(`:dir(${p})`, x)
}
export function lang(p, x) {
  return pseudo(`:lang(${p})`, x)
}
export function not(p, x) {
  // should this be a plugin?
  let selector = p.split(',').map(x => x.trim()).map(x => `:not(${x})`)
  if(selector.length === 1) {
    return pseudo(`:not(${p})`, x)
  }
  return select(selector.join(''), x)

}
export function nthChild(p, x) {
  return pseudo(`:nth-child(${p})`, x)
}
export function nthLastChild(p, x) {
  return pseudo(`:nth-last-child(${p})`, x)
}
export function nthLastOfType(p, x) {
  return pseudo(`:nth-last-of-type(${p})`, x)
}
export function nthOfType(p, x) {
  return pseudo(`:nth-of-type(${p})`, x)
}

// pseudoelements
export function after(x) {
  return pseudo('::after', x)
}
export function before(x) {
  return pseudo('::before', x)
}
export function firstLetter(x) {
  return pseudo('::first-letter', x)
}
export function firstLine(x) {
  return pseudo('::first-line', x)
}
export function selection(x) {
  return pseudo('::selection', x)
}
export function backdrop(x) {
  return pseudo('::backdrop', x)
}
export function placeholder(x) {
  // https://github.com/threepointone/glamor/issues/14
  return merge(
    pseudo('::placeholder', x),
    pseudo('::-webkit-input-placeholder', x),
    pseudo('::-moz-placeholder', x),
    pseudo('::-ms-input-placeholder', x)
  )
}

// we can add keyframes in a similar manner, but still generating a unique name
// for including in styles. this gives us modularity, but still a natural api
export function keyframes(name, kfs) {
  if(!kfs) {
    kfs = name,
    name='animation'
  }

  // do not ignore empty keyframe definitions for now.
  kfs = clean(kfs) || {}
  let spec = {
    id: hashify(name, kfs),
    type: 'keyframes',
    name,
    keyframes: kfs
  }
  register(spec)
  insertKeyframe(spec)
  return name + '_' + spec.id
}

// we don't go all out for fonts as much, giving a simple font loading strategy
// use a fancier lib if you need moar power
export function fontFace(font) {
  font = clean(font)
  let spec = {
    id: hashify(font),
    type:'font-face',
    font
  }
  register(spec)
  insertFontFace(spec)

  return font.fontFamily
}


/*** helpers for web components ***/
// https://github.com/threepointone/glamor/issues/16

export function cssFor(...rules) {
  rules = clean(rules)
  return rules ? flatten(rules.map(r =>
    registered[idFor(r)]).map(ruleToCSS)).join('') : ''
}

export function attribsFor(...rules) {
  rules = clean(rules)
  let htmlAttributes = rules ? rules.map(rule => {
    idFor(rule) // throwaway check for rule
    let key = Object.keys(rule)[0], value = rule[key]
    return `${key}="${value || ''}"`
  }).join(' ') : ''

  return htmlAttributes
}


export function css(...rules) {
  if(rules[0] && rules[0].length && rules[0].raw) {
    throw new Error('you forgot to include glamor/babel in your babel plugins.')
  }
  return merge(rules)
  // helper for transpiled inline literals 
  // and eventually central api (#83)  
}
