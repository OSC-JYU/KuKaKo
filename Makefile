IMAGES := $(shell docker images -f "dangling=true" -q)
CONTAINERS := $(shell docker ps -a -q -f status=exited)
VOLUME := kukako-data
VERSION := 0.1h


clean:
	docker rm -f $(CONTAINERS)
	docker rmi -f $(IMAGES)

create_volume:
	docker volume create $(VOLUME)

build:
	docker build -t osc.jyu.fi/kukako:$(VERSION) .

start:
	docker run -d --name kukako \
		-v $(VOLUME):/logs \
		-p 8100:8100 \
		-e ARCADEDB_HOST=http://localhost \
		-e ARCADEDB_DB=kukako \
		-e ARCADEDB_PASSWORD=node_master \
		-e MODE=development \
		--network arcadedb-net \
		--restart unless-stopped \
		osc.jyu.fi/kukako:$(VERSION)

restart:
	docker stop kukako
	docker rm kukako
	$(MAKE) start

bash:
	docker exec -it kukako bash
