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


