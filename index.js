
const fetch = require('node-fetch'),
	Epub = require("epub-gen"),
	OpenCC = require('opencc'),
	fs = require("fs"),
	cheerio = require("cheerio"),
	sleep = require('sleep'),
	md5 = require('md5'),
	argv = require('argv');


var args = argv.option([
    {
        name: 'url',
        short: 'u',
        type: 'string',
        description:'fetch target url esjzone'
    },
    {
        name: 'epub',
        short: 'e',
        type: 'path',
        description:'output epub file name'
    },
    {
        name: 'filter',
        short: 'f',
        type: 'path',
        description:'filter reg replace, json : {title:[{regexp, replace}], content:[]}'
    },
    {
        name: 'imgs',
        short: 'i',
        type: 'list,path',
        description:'add image into epub'
    },
    {
        name: 'trad',
        short: 't',
        type: 'bool',
        description:'Traditional'
    },
    {
        name: 'debug',
        short: 'd',
        type: 'bool',
        description:'Debug Info'
    }
]).run();

if (!args.options.url) {
	argv.help();
	process.exit();
}

const tw = args.options.trad? true: false,
	  debug = args.options.debug? true: false;
const converter = tw? new OpenCC('s2tw.json') : false;
const cheerioOpt = {decodeEntities: false};

var filter;
var getChapter = [], cache=[];
var fn = './cache_' + args.options.url.match(/(\d+)\.html/)[1];
var rebuild = false, epubInfo;

if (args.options.filter && fs.existsSync(args.options.filter)) {
	let fsCache = fs.readFileSync(args.options.filter);
	let cacheObj = JSON.parse(fsCache.toString());
	filter = (cacheObj.title)? cacheObj : false;
}

if(fs.existsSync(fn)) {
	let fsCache = fs.readFileSync(fn);
	epubInfo = JSON.parse(fsCache.toString());
} else {
	epubInfo = {
		lang: "zh",
	    title: "",
	    author: "",
	    publisher: "",
	    cover: "",
	    content: []
	};
}

// args.options.imgs

fetch(args.options.url).then(res => res.text())
.then(body => {
	let dom = cheerio.load(body, cheerioOpt);

	epubInfo.cover = dom("div.product-gallery a").first().attr("href");
	epubInfo.title = dom("h2.p-t-10").first().text();
	let info = dom("ul.book-detail li");
	epubInfo.author = info.first().find('a').first().text();

	var links = dom("#chapterList a");

	links.each((i, n) => {
		let d = dom(n),
			no = d.data('title');
		var href = d.attr('href'),
			title = d.text();
		if(href.search(/www\.esjzone\.cc/) == -1) {
			console.log("Title '%s' href: %s",title, href);
			return;
		}
		if(debug) {
			console.log("oTitle '%s'",title);
		}

		if(filter && filter.title) {
			filter.title.forEach((n, i) => {
				if(!n[0] && !n[1] && !title) return ;
				let reg = new RegExp(n[0]);
				title = title.replace(reg, n[1]);
			});
		}

		if(!title) return;
		if(debug) {
			console.log("NO:%s, Title:'%s'", i, title);
		}

		if(tw) {
			title = converter.convertSync(title);
		}

		cache.push({t:title, u:href});
		// epubInfo.content.push({title:title, data: ""});
		// getChapter.push(fetch(href).then(res => res.text()));
	});

	let chapterListHash = md5(JSON.stringify(cache));
	rebuild = (!epubInfo.hash || (epubInfo.hash != chapterListHash))? true : false;

	var baseLine = epubInfo.content? epubInfo.content.length : 0;
	if(!rebuild) {
		console.log("cache is ok");
		process.exit();
	} else {

		cache.forEach((n, i) => {
			console.log("%o, %s", epubInfo.list, n.u)
			if ( epubInfo.list && epubInfo.list[i] && (epubInfo.list[i].u == n.u)) {
				return ;
			}
			console.log('new title %s', n.t);
			epubInfo.content.push({title:n.t, data: ""});
			getChapter.push(fetch(n.u).then(res => res.text()));
		});
	}

	Promise.all(getChapter).then(docs => {
		docs.forEach((body, i) => {
			let pageDom = cheerio.load(body, cheerioOpt);
			let title = pageDom('section h2').first().text();
			let content = pageDom('section div.forum-content').html();
			if(filter && filter.content) {
				filter.content.forEach((n, i) => {
					if(!n[0] && !n[1] && !content) return ;
					let reg = new RegExp(n[0], 'gm');
					content = content.replace(reg, n[1]);
				});
			}
			if(tw) {
				content = converter.convertSync(content)
			}
			// content.img change to abs path;
			if(debug) {
				console.log("Page %s, %s, %s", i, title, content)
			}

			if(rebuild) {
				epubInfo.content[baseLine + i].data = content;
			}
		});

		epubInfo.list = cache
		epubInfo.hash = md5(JSON.stringify(cache));
		fs.writeFile(fn, JSON.stringify(epubInfo), e => {
			if(e) console.log("Cache write Error %o", e);
		});

		new Epub(epubInfo, args.options.epub)
		.promise.then(
			() => {
				console.log("Ebook Generated Successfully!")
			},
			err => console.error("Failed to generate Ebook because of ", err)
		);
	});
});