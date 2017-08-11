'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

exports.handler = function(event, context, callback) {
  console.log('Received event:', JSON.stringify(event, null, 2));
  const key = event.queryStringParameters.key;
  const match = key.match(/([^\/]+)\/(full|square|\d+,\d+,\d+,\d+|pct:\d+,\d+,\d+,\d+)\/(full|max|!?\d*,\d*|pct:\d+)\/(!?\d+)\/(color|gray|bitonal|default)\.(jpg|png)/)
  console.log('Match:', JSON.stringify(match, null, 2));
  const originalKey = match[1];
  const region = match[2];
  const size = match[3];
  const rotation = match[4];
  const quality = match[5];
  const format = match[6];

  S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then(function(data) {
      var s = Sharp(data.Body);
      var md = s.metadata();

      return new Promise(function(resolve, reject) {
        md.then(function(metadata) {
          resolve({ s: s, md: metadata });
        })
      });
    })
    .then(function(data) {
      console.log('Metadata:', JSON.stringify(md, null, 2));
      var s = data.s;
      var md = data.md;
      const extractRegion = { left: NaN, top: NaN, width: NaN, height: NaN };

      if (region != "full") {
        if (region == 'square') {
          var w = md.width;
          var h = md.height;
          var min = Math.min(w, h);

          extractRegion.width = min;
          extractRegion.height = min;

          var offset = Math.abs(w - h) / 2;

          if (h >= w) {
            extractRegion.left = 0;
            extractRegion.top = offset;
          } else {
            extractRegion.top = 0;
            extractRegion.left = offset;
          }
        } else if(region.match(/^\d+,\d+,\d+,\d+$/)) {
          var regionMatch = region.match(/^(\d+),(\d+),(\d+),(\d+)$/)
          extractRegion.left = parseInt(regionMatch[1], 10);
          extractRegion.top = parseInt(regionMatch[2], 10);
          extractRegion.width = parseInt(regionMatch[3], 10);
          extractRegion.height = parseInt(regionMatch[4], 10);
        } else if (region.match(/pct:/)) {
          var w = md.width;
          var h = md.height;
          
          var regionMatch = region.match(/pct:(\d+),(\d+),(\d+),(\d+)$/)
          extractRegion.left = width * parseInt(regionMatch[1], 10) / 100.0;
          extractRegion.top = height * parseInt(regionMatch[2], 10) / 100.0;
          extractRegion.width = width * parseInt(regionMatch[3], 10) / 100.0;
          extractRegion.height = height * parseInt(regionMatch[4], 10) / 100.0;
        }
        console.log('Extract Region:', JSON.stringify(extractRegion, null, 2));
        s = s.extract(extractRegion)
      }

      if (size != "full" && size != "max") {
        if (size.match(/pct:/)) {
          var pct = parseFloat(size.match(/pct:(\d+)/)[1], 10) / 100.0;
          if (extractRegion.width != NaN && extractRegion.height != NaN) {
            console.log('Resize:', pct * extractRegion.width, pct * extractRegion.height);
            s = s.resize(pct * extractRegion.width, pct * extractRegion.height);
          } else {
            var w = md.width;
            var h = md.height;

            console.log('Resize:', pct * w, pct * h);
            s = s.resize(pct * w, pct * h);
          }
        } else if (size.match(/^!/)) {
          var adsf = size.match(/^!(\d+),(\d+)/);
          console.log('Resize (max):', parseInt(asdf[1], 10), parseInt(asdf[2], 10));
          s = s.resize(parseInt(asdf[1], 10), parseInt(asdf[2], 10)).max();
        }
        } else if (size.match(/^,/)) {
          var h = parseInt(size.match(/^,(\d+)/)[1], 10);
          console.log('Resize (height):', h);
          s = s.withoutEnlargement().resize(null, h);
        } else if (size.match(/,$/)) {
          var w = parseInt(size.match(/(\d+),$/)[1], 10);
          console.log('Resize (width):', w);
          s = s.withoutEnlargement().resize(w, null);
        } else if (size.match(/^(\d+),(\d+)/)) {
          var adsf = size.match(/^(\d+),(\d+)/);
          console.log('Resize (ignore aspect):', parseInt(asdf[1], 10), parseInt(asdf[2], 10));
          s = s.ignoreAspectRatio().resize(parseInt(asdf[1], 10), parseInt(asdf[2], 10));
      }

      if (rotation != "0") {
        const rotationAngle = (rotation.match(/!/) ? -1 : 1) * parseFloat(rotation.match(/(\d+)/)[1], 10);
        console.log('Rotate:', rotationAngle);
        s = s.rotate(rotationAngle);
      }
      console.log('Format:', format);

      return s.toFormat(format).toBuffer();
    })
    .then(buffer => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/' + format,
        Key: key,
      }).promise()
    )
    .then(() => callback(null, {
        statusCode: '301',
        headers: {'location': `${URL}/${key}`},
        body: '',
      })
    )
    .catch(err => callback(err))
}
