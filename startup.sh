npm install
pm2 start server.js --name="pm2-web-log"
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Print the public IP
echo "Public IP Address: $PUBLIC_IP:5000"

