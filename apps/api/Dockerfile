FROM golang:1.25.7-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN go generate ./ent
RUN CGO_ENABLED=0 go build -o /api ./apps/api/cmd/api
FROM gcr.io/distroless/static-debian12
COPY --from=build /api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
