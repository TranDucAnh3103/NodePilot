package helperproto

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"
)

type Client struct {
	socketPath string
	mu         sync.Mutex
}

func NewClient(socketPath string) *Client {
	return &Client{
		socketPath: socketPath,
	}
}

// Call executes an IPC request to hscc-helper and returns the Response.
func (c *Client) Call(ctx context.Context, req *Request) (*Response, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	deadline, ok := ctx.Deadline()
	var timeout time.Duration
	if ok {
		timeout = time.Until(deadline)
		if timeout <= 0 {
			return nil, context.DeadlineExceeded
		}
	} else {
		timeout = 15 * time.Second
	}

	conn, err := net.DialTimeout("unix", c.socketPath, timeout)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to helper socket %s: %w", c.socketPath, err)
	}
	defer conn.Close()

	if err := conn.SetDeadline(time.Now().Add(timeout)); err != nil {
		return nil, fmt.Errorf("failed to set connection deadline: %w", err)
	}

	reqBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Write JSON message + newline
	if _, err := conn.Write(append(reqBytes, '\n')); err != nil {
		return nil, fmt.Errorf("failed to write request to helper: %w", err)
	}

	// Read JSON line response
	reader := bufio.NewReader(conn)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		return nil, fmt.Errorf("failed to read response from helper: %w", err)
	}

	var resp Response
	if err := json.Unmarshal(line, &resp); err != nil {
		return nil, fmt.Errorf("failed to parse helper response: %w", err)
	}

	return &resp, nil
}
