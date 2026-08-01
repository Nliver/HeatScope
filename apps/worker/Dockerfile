FROM golang:1.25.7-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN go generate ./ent
RUN CGO_ENABLED=0 go build -o /worker ./apps/worker/cmd/worker
FROM gcr.io/distroless/static-debian12
COPY --from=build /worker /worker
ENTRYPOINT ["/worker"]
