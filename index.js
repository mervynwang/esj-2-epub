
const fetch = require('node-fetch'),
	Epub = require("epub-gen"),
	cheerio = require("cheerio"),
	sleep = require('sleep'),
	argv = require('argv'),
	OpenCC = require('opencc');

const converter = new OpenCC('s2t.json');


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
        name: 'trad',
        short: 't',
        type: 'bool',
        description:'Traditional'
    }
]).run();

if (!args.options.url) {
	argv.help();
	process.exit();
}


var epubInfo = {
    title: "",
    author: "",
    publisher: "",
    cover: "",
    content: []
};

var getChapter = [];

fetch(args.options.url).then(res => res.text())
.then(body => {
	let dom = cheerio.load(body);

	epubInfo.cover = dom("div.product-gallery a").first().attr("href");
	epubInfo.title = dom("h2.p-t-10").first().text()
	let info = dom("ul.book-detail li");
	epubInfo.author = info.first().find('a').first().text();

	var links = dom("#chapterList a");

	links.each((i, n) => {

		let d = dom(n),
			no = d.data('title');
		var href = d.attr('href'),
			title = d.text();
		if(href.search(/www\.esjzone\.cc/) == -1) return;
		title = converter.convertSync(title)
		epubInfo.content.push({title:title, data: ""});


		getChapter.push(fetch(href).then(res => res.text()));

	});

	Promise.all(getChapter).then(docs => {
		docs.forEach((body, i) => {
			let pageDom = cheerio.load(body);
			let title = pageDom('section h2').first().text();
			let content = pageDom('section div.forum-content').html();
			epubInfo.content[i].data = converter.convertSync(content)
		});

		// console.log("done");

		new Epub(epubInfo, args.options.epub)
		.promise.then(
			() => {
				console.log("Ebook Generated Successfully!")
			},
			err => console.error("Failed to generate Ebook because of ", err)
		);

	});
});