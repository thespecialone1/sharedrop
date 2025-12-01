module file-share-app

go 1.20

require (
	file-share-app/internal v0.0.0
	github.com/gorilla/websocket v1.5.3
	github.com/mattn/go-sqlite3 v1.14.32
	github.com/nfnt/resize v0.0.0-20180221191011-83c6a9932646
)

replace file-share-app/internal => ./internal
