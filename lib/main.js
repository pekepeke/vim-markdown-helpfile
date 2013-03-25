
// Module dependencies

var fs = require('fs'),
  path = require('path'),
  util = require('util'),
  hogan = require('hogan.js'),
  stream = require('stream'),
  marked = require('marked');

marked.setOptions({
  gfm: true
});

module.exports = HelpFile;
HelpFile.template = hogan.compile(fs.readFileSync(path.join(__dirname, 'tmpl.mustache'), 'utf8'));

//
// Basic markdown to vim helpfile generator.
//

function HelpFile(opts) {
  this.readable = true;
  this.writable = true;
  this.chunks = [];
  this.opts = opts || {};
  stream.Stream.call(this);
}

util.inherits(HelpFile, stream.Stream);

HelpFile.prototype.write = function(chunk) {
  this.chunks = this.chunks.concat(chunk);
};

HelpFile.prototype.end = function() {
  // parse streaming markdown
  var data = this.parse(this.chunks.join(''));

  // render template
  var content = HelpFile.template.render(data);

  this.emit('data', content);
  this.emit('end');
};

HelpFile.prototype.parse = function(body) {
  var tokens = marked.lexer(body);

  // name is the first heading element found
  // description is the first non heading element found (say a <p />)
  // sections are divided each time a <h2 /> element is found.
  return new Tokens(tokens, this.opts).data;
};

function Tokens(tokens, opts) {
  this.tokens = tokens;
  this.data = {
    name: opts.name || '',
    desc: opts.desc || '',
    sections: []
  };

  this.init();
}

// parse tokens, build data
Tokens.prototype.init = function() {
  var data = this.data,
    self = this;

  this.tokens.forEach(function(t) {
    // p node handled by text handler
    var type = t.type === 'paragraph' ? 'text' : t.type;
    if(!self[type]) return;
    self[type](t);
  });
};

Tokens.prototype.heading = function(t) {
  t.text = t.text.trim();

  // set name if not def
  var name = this.data.name = this.data.name || t.text

  , id = name === t.text ? '-introduction' : '-' + t.text.trim()
	, internal = true;
  id = this.data.name.replace(/vim-?|the\s*/i, '') + id.toLowerCase();

  // hmmm, a bit hacky all of this, will probably generate crap on some files
  if (t.text.match(/^<Plug>/) || t.text.match(/^[gbt]:/)) {
    id = t.text;
  } else if (t.text.match(/^:/)) {
    id = t.text.replace(/ .*$/, '');
  } else if (id.match(/\)$/)) {
    id = t.text.replace(/\(.*\)$/, '');
  } else {
    id = id.replace(/[^\w]+/g, '-');
    // clean trailing -
    id = id.replace(/-$/, '');
    internal = false;
  }
  function format_line(a, b, len, head_indent, tail_indent) {
    head_indent = head_indent || 0;
    tail_indent = tail_indent || 0;
    var sp = new Array(len - (head_indent + tail_indent + a.length + b.length + 1 + 1)).join(" ")
      , head_sp = new Array(head_indent + 1).join(" ");
    return util.format(head_sp + "%s" + sp + " %s", a, b);
  }

  // build a new section
  var s = this.data.sections;
  this.last = s[s.length] = {
    title: t.text,
    depth: t.depth,
    h1: t.depth == 1,
    h2: t.depth == 2,
    h3: t.depth == 3,
    h4: t.depth == 4,
    h5: t.depth == 5,
    h6: t.depth == 6,
    header : !internal,
    section: t.text.toUpperCase(),
    index_title: format_line(t.text, "|" + id + "|", 58, (t.depth - 1) * 2),
    section_title: format_line(t.text, "*" + id + "*", 78, 0, (t.depth - 1) * 2),
    id: id,
    parts: []
  };
};

Tokens.prototype.text = function(t) {
  var s = t.text.trim();
  //this.data.desc = this.data.desc || s;
  if (!this.data.desc) {
    this.data.desc = s.replace(/\n/,"\n\n");
    s = "";
  }
  this.last && this.last.parts.push({ body: s });
};

Tokens.prototype.code = function(t) {
  var code = t.text.trim().split('\n').map(function(l) {
    if(!l) return l;
    return '    ' + l;
  });

  t.text = ['>'].concat(code).concat('<').join('\n');
  this.last.parts.push({ body: t.text });
};

