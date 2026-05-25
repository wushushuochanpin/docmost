"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedProviders = void 0;
exports.getEmbedProviderById = getEmbedProviderById;
exports.getEmbedUrlAndProvider = getEmbedUrlAndProvider;
exports.embedProviders = [
    {
        id: "loom",
        name: "Loom",
        regex: /^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([\da-zA-Z]+)\/?/,
        getEmbedUrl: function (match, url) {
            if (url.includes("/embed/")) {
                return url;
            }
            return "https://loom.com/embed/".concat(match[1]);
        },
    },
    {
        id: "airtable",
        name: "Airtable",
        regex: /^https:\/\/(www.)?airtable.com\/([a-zA-Z0-9]{2,})\/.*/,
        getEmbedUrl: function (match, url) {
            var path = url.split("airtable.com/");
            if (url.includes("/embed/")) {
                return url;
            }
            return "https://airtable.com/embed/".concat(path[1]);
        },
    },
    {
        id: "figma",
        name: "Figma",
        regex: /^https:\/\/[\w\.-]+\.?figma.com\/(file|proto|board|design|slides|deck)\/([0-9a-zA-Z]{22,128})/,
        getEmbedUrl: function (match, url) {
            return "https://www.figma.com/embed?url=".concat(url, "&embed_host=docmost");
        },
    },
    {
        id: "typeform",
        name: "Typeform",
        regex: /^(https?:)?(\/\/)?[\w\.]+\.typeform\.com\/to\/.+/,
        getEmbedUrl: function (match, url) {
            return url;
        },
    },
    {
        id: "miro",
        name: "Miro",
        regex: /^https:\/\/(www\.)?miro\.com\/app\/board\/([\w-]+=)/,
        getEmbedUrl: function (match, url) {
            if (url.includes("/live-embed/")) {
                return url;
            }
            return "https://miro.com/app/live-embed/".concat(match[2], "?embedMode=view_only_without_ui&autoplay=true&embedSource=docmost");
        },
    },
    {
        id: "youtube",
        name: "YouTube",
        regex: /^((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/,
        getEmbedUrl: function (match, url) {
            if (url.includes("/embed/")) {
                return url;
            }
            return "https://www.youtube-nocookie.com/embed/".concat(match[5]);
        },
    },
    {
        id: "vimeo",
        name: "Vimeo",
        regex: /^(https:)?\/\/(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/,
        getEmbedUrl: function (match) {
            return "https://player.vimeo.com/video/".concat(match[4]);
        },
    },
    {
        id: "framer",
        name: "Framer",
        regex: /^https:\/\/(www\.)?framer\.com\/embed\/([\w-]+)/,
        getEmbedUrl: function (match, url) {
            return url;
        },
    },
    {
        id: "gdrive",
        name: "Google Drive",
        regex: /^((?:https?:)?\/\/)?((?:www|m)\.)?(drive\.google\.com)\/file\/d\/([a-zA-Z0-9_-]+)\/.*$/,
        getEmbedUrl: function (match) {
            return "https://drive.google.com/file/d/".concat(match[4], "/preview");
        },
    },
    {
        id: "gsheets",
        name: "Google Sheets",
        regex: /^((?:https?:)?\/\/)?((?:www|m)\.)?(docs\.google\.com)\/spreadsheets\/d\/([a-zA-Z0-9_-]+)\/.*$/,
        getEmbedUrl: function (match, url) {
            return url;
        },
    },
    {
        id: "iframe",
        name: "Iframe",
        regex: /any-iframe/,
        getEmbedUrl: function (match, url) {
            return url;
        },
    },
];
function getEmbedProviderById(id) {
    return exports.embedProviders.find(function (provider) { return provider.id.toLowerCase() === id.toLowerCase(); });
}
function getEmbedUrlAndProvider(url) {
    for (var _i = 0, embedProviders_1 = exports.embedProviders; _i < embedProviders_1.length; _i++) {
        var provider = embedProviders_1[_i];
        var match = url.match(provider.regex);
        if (match) {
            return {
                embedUrl: provider.getEmbedUrl(match, url),
                provider: provider.name.toLowerCase(),
            };
        }
    }
    return {
        embedUrl: url,
        provider: "iframe",
    };
}
