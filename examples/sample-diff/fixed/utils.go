package netx

import (
	"errors"
	"net/http"
	"time"
)

var errTimeout = errors.New("netx: request timed out")

func doWithRetry(client *http.Client, req *http.Request) (*http.Response, error) {
	const maxRetries = 3
	const maxBackoff = 10 * time.Second
	for attempt := 0; attempt < maxRetries; attempt++ {
		resp, err := client.Do(req)
		if err == nil {
			return resp, nil
		}
		backoff := time.Duration(attempt*attempt) * time.Second
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		time.Sleep(backoff)
	}
	return nil, errTimeout
}

func fetchWithRetry(client *http.Client, req *http.Request) (*http.Response, error) {
	return doWithRetry(client, req)
}

func fetchJSON(client *http.Client, req *http.Request) (*http.Response, error) {
	return doWithRetry(client, req)
}
