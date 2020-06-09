This is a JSON powered document server. It provides JSON endpoints to create/search/retrieve/delete JSON
docs and related binary assets (like images).


# Authentication

All api calls must be authenticated except for downloading files and
getting info on that file. In both cases you must already know the document id.

To authenitcate use github authenication at the /auth/github route.

# Create a document

Post a document to `/docs/username/upload`. It should be either a JSON
post or a form multipart (which is typically used for file uploads in the browser).  The file will be saved to a random
directory and filename on disk under the username. The desired doctype, title, filename and mimetype can be passed as query parameters.
For example, to upload cat.jpg for use as your user photo, post the image to the URL

```
docs/myusername/upload?filename=cat.jpg&type=avatar&mimetype=image/jpg&cat%20image
```

The image and it's metadata will be saved on the server.

You can optionally specify an id to use. If no id is specified the server
will create a new ID for the document.  This id will be returned
in the result from the JSON call.

# thumbnails

documents may be saved with thumbnails. POST the thumbnail image to
```
docs/myusername/thumbnail/docid/version/mimetype/subtype/widthxheight/filename  
```
for example, you could post a PNG image to

```
docs/mysername/thumbnail/docid123/latest/image/png/100x300/thumbnail.png
```

retrieve the thumbnail with GET
 
```
docs/myusername/thumbnail/docid/version/mimetype/subtype/widthxheight/thumbnail.png
```

A documenet can have multiple thumbnails. They are identifed uniquely by the document id
and the width and height and mimetype of the thumbnail.

When posting a thumbnail the doc metadata will be updated to reflect
the new thumbnail. So retrieving the doc info will now show the thumbnail
URLs as well.

```json
{
    "username": "user1",
    "type": "json",
    "title": "my doc title",
    "mimetype":"application/json",
    "extension": "json",
    "datapath":"testdir/data/user1/data4345",
    "thumbnails": [
      {
        "width": 300,
        "height": 100,
        "mimetype":"image/png",
        "href": "testdir/data/user1/data4345/latest/image/png/300x100/thumbnail.png"
      }
    ]
}
```


# Get document

To retrieve info on a document call

```
/docs/username/info/docid/version
```


Where `username` is the name of the user and `docid`
is the id of the document. `version` can be anything
and is currently unused.  

This will return a JSON object with info about the document.

To retrieve the actual document call:

```
/docs/username/data/docid/latest/mimetype/subtype/filename
```

The `mimetype`, `subtype`, and `filename` are currently unused. The file
will be returned using the mimetype the document was saved with.

# configuration

You can run it from the command line with the start.js file and node. Config can be provided
by environment variables or from a `.env` file on disk.  The variable you probably want to configure are:

for github auth config

```shell script
GITHUB_CLIENT_ID=github client id
GITHUB_CLIENT_SECRET=github client secret
GITHUB_CALLBACK_URL=github callback url
ALLOWED_USERS=[array,of,usernames]
```

for server setup:

```shell script
DIR=dir_to_load_files_from
AUTH_ENABLED=true  // on by default
PORT=3000 // port to run on
```


# implementation

docserver2 uses nedb internally, which is a pure JSON database. Files are stored on disk in a target directory,
in username subdirs, and with generated filenames. User provided filenames are saved but never used on disk.
