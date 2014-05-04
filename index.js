var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var cheerio = require('cheerio');
var walkSync = require('walk-sync');
var mapSeries = require('promise-map-series');
var Writer = require('broccoli-writer');
var helpers = require('broccoli-kitchen-sink-helpers');

// AngularJS template bundling plugin.
//
// Takes a tree, and an object whose keys are the HTML pages to rewrite. The
// values are lists of regular expressions for files that should be included as
// ng-template script-tags into the page.
//
// All files that are matched to be included in a page will also be discarded
// from the tree. Optionally, this list can be overridden by passing a third
// array parameter of regular expressions for files to discard.
//
// The IDs for the included templates assume the tree is also the document root
// on the web server, and that the templates are referenced by absolute paths.
var BundleTemplates = function(tree, pages, discard) {
    if (!(this instanceof BundleTemplates))
        return new BundleTemplates(tree, pages, discard);

    if (!discard) {
        discard = [];
        for (var page in pages)
            discard = discard.concat(pages[page]);
    }

    this.tree = tree;
    this.pages = pages;
    this.discard = discard;
};
BundleTemplates.prototype = Object.create(Writer.prototype);

BundleTemplates.prototype.write = function(readTree, dst) {
    var self = this;
    return readTree(self.tree)
    .then(function(src) {
        return mapSeries(walkSync(src), function(p) {
            var i = path.join(src, p);
            var o = path.join(dst, p);

            // Rebuild directories in the output.
            if (p.slice(-1) === '/')
                return mkdirp.sync(o);

            // Process specified pages.
            var page = self.pages[p];
            if (page)
                return self.processIndex(i, o, src, page);

            // Preserve files not on the discard list.
            var match = self.discard.some(function(re) {
                return re.test(p);
            });
            if (!match)
                return helpers.copyPreserveSync(i, o);
        });
    });
};

BundleTemplates.prototype.processIndex = function(i, o, src, page) {
    var html = fs.readFileSync(i, 'utf-8');
    var $ = cheerio.load(html);

    // Walk files again, looking for matching templates.
    // Create a script tag for each match.
    return mapSeries(walkSync(src), function(p) {
        var match = page.some(function(re) {
            return re.test(p);
        });
        if (match) {
            var contents = fs.readFileSync(path.join(src, p), 'utf-8');
            var tag = $('<script/>')
                .attr('type', 'text/ng-template')
                .attr('id', '/' + p)
                .append(contents);
            $('body').append(tag);
        }
    }).then(function() {
        // Write processed HTML.
        fs.writeFileSync(o, $.html());
    });
};

module.exports = BundleTemplates;
