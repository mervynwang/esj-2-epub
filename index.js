
const fetch = require('node-fetch'),
	Epub = require("epub-gen"),
	// OpenCC = require('opencc'),
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
        short: 'f',
        type: 'path',
        description:'output epub file name'
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
    },    
    {
        name: 'nu',
        short: 'n',
        type: 'int',
        description:'max number'
    }
]).run();

if (!args.options.url) {
	argv.help();
	process.exit();
}

const tw = args.options.trad? true: false,
	  debug = args.options.debug? true: false;
const converter = tw? new OpenCC('s2tw.json') : false;


var epubInfo = {
	lang: "zh",
    title: "",
    author: "",
    publisher: "",
    cover: "",
    content: []
};

var getChapter = [], cache=[];
var fn = './cache_' + args.options.url.match(/(\d+)\.html/)[1];
// args.options.imgs

fetch(args.options.url).then(res => res.text())
.then(body => {
	let dom = cheerio.load(body);

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
		if(href.search(/www\.esjzone\.cc/) == -1) return;
		if(tw) {
			title = converter.convertSync(title)
		}
		if (args.options.nu && (args.options.nu <= i)) return;

		if(debug) {
			console.log("Title %s, %s", i, title)
		}

		epubInfo.content.push({title:title, data: ""});
		cache.push({t:title, u:href});

		getChapter.push(fetch(href).then(res => res.text()));
	});

	var rebuild = false;
	if(fs.existsSync(fn)) {
		let chapterListHash = md5(JSON.stringify(cache));
		let fsCache = fs.readFileSync(fn);
		let cacheObj = JSON.parse(fsCache.toString());

		if(debug) {
			console.log("new %s, old %s", chapterListHash, cacheObj.hash);
		}

		rebuild = (!cacheObj 
			|| !cacheObj.hash 
			|| (cacheObj.hash != chapterListHash))? true : false;
	}

	if(!rebuild) {
		console.log("cache is ok");
		process.exit();
	}

	Promise.all(getChapter).then(docs => {
		docs.forEach((body, i) => {
			let pageDom = cheerio.load(body);
			let title = pageDom('section h2').first().text();
			let content = pageDom('section div.forum-content').html();
			if(tw) {
				content = converter.convertSync(content)	
			}
			if(debug) {
				console.log("Page %s, %s, %s", i, title, content)
			}
			epubInfo.content[i].data = content;
		});

		epubInfo.list = cache
		epubInfo.hash = md5(JSON.stringify(cache));
		fs.writeFile(fn, JSON.stringify(epubInfo), e => {
			console.log("Cache write Error %o", e);
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